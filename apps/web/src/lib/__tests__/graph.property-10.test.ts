// Feature: run-inputs-and-variables, Property 10: Accepted graphs have a well-formed, collision-free key namespace
//
// For any Workflow_Graph accepted by the Graph_Compiler (i.e.
// graphToSteps(graph).errors.length === 0), the set of Run_Input_Keys and
// the set of Step_Reference_Keys SHALL be disjoint, and all
// Step_Reference_Keys SHALL be pairwise distinct and match
// ^[A-Za-z_][A-Za-z0-9_]*$.
//
// **Validates: Requirements 5.1, 5.2, 6.4**
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { GraphEdge, GraphNode, RunInputDef, WorkflowGraph } from '@/types'
import { executableAncestors, graphToSteps, stepReferenceKey } from '../graph'
import { getRunInputs, RUN_INPUT_KEY_PATTERN } from '../run-inputs'

/** A small, shared pool of pattern-valid identifiers, reused at low
 * frequency across Run_Inputs and custom Step_Reference_Keys so that some
 * generated graphs naturally collide/duplicate, in addition to the
 * deliberate defect injection below. */
const POOL = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']

const validKeyArbitrary = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => RUN_INPUT_KEY_PATTERN.test(s))

/** Mostly a fresh, large-space valid key; occasionally one drawn from the
 * small shared POOL, biasing generation toward well-formed keys (per the
 * task's guidance) while still allowing some natural collisions. */
const cleanKeyArbitrary = fc.oneof(
  { arbitrary: validKeyArbitrary, weight: 9 },
  { arbitrary: fc.constantFrom(...POOL), weight: 1 }
)

/** A deliberately malformed key: empty, containing a disallowed character,
 * digit-leading, or over the 64-character limit. Only used for the
 * `malformedStep` defect below, never as a "clean" key. */
const malformedKeyArbitrary = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 10 }).map((s) => `${s}-bad`),
  fc.constantFrom('1abc', '2xyz', '9key'),
  validKeyArbitrary.map((s) => s.padEnd(70, 'a'))
)

function makeRunInputDef(key: string): RunInputDef {
  return { key, label: 'Label', fieldType: 'text', required: false }
}

interface Skeleton {
  runInputDefs: RunInputDef[]
  promptIds: string[]
  customKeys: (string | undefined)[]
  edges: GraphEdge[]
}

/**
 * Structural shape: 0-6 Run_Inputs, 1-8 Prompt nodes, and arbitrary edges
 * (both start->prompt and prompt->prompt, in either index direction --
 * `executableAncestors`'s `seen`-guard makes this safe even if the edges
 * happen to form a cycle). Keys are "clean" (well-formed, occasionally
 * colliding via the shared POOL) at this stage; malformation and other
 * defects are injected afterward so the reject path gets real signal too.
 */
const skeletonArbitrary: fc.Arbitrary<Skeleton> = fc
  .integer({ min: 1, max: 8 })
  .chain((promptCount) =>
    fc.record({
      runInputKeys: fc.array(cleanKeyArbitrary, { minLength: 0, maxLength: 6 }),
      promptCount: fc.constant(promptCount),
      customKeys: fc.array(fc.option(cleanKeyArbitrary, { nil: undefined }), {
        minLength: promptCount,
        maxLength: promptCount,
      }),
      edgeMatrix: fc.array(
        fc.array(fc.boolean(), { minLength: promptCount, maxLength: promptCount }),
        { minLength: promptCount, maxLength: promptCount }
      ),
      startEdges: fc.array(fc.boolean(), { minLength: promptCount, maxLength: promptCount }),
    })
  )
  .map(({ runInputKeys, promptCount, customKeys, edgeMatrix, startEdges }) => {
    const promptIds = Array.from({ length: promptCount }, (_, i) => `prompt-${i}`)
    const edges: GraphEdge[] = []
    let edgeId = 0
    for (let i = 0; i < promptCount; i++) {
      if (startEdges[i]) {
        edges.push({ id: `e${edgeId++}`, source: 'start-1', target: promptIds[i] })
      }
      for (let j = 0; j < promptCount; j++) {
        if (i !== j && edgeMatrix[i][j]) {
          edges.push({ id: `e${edgeId++}`, source: promptIds[j], target: promptIds[i] })
        }
      }
    }
    return {
      runInputDefs: runInputKeys.map(makeRunInputDef),
      promptIds,
      customKeys,
      edges,
    }
  })

function buildSkeletonGraph(skeleton: Skeleton): WorkflowGraph {
  const start: GraphNode = { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, config: {} }
  const prompts: GraphNode[] = skeleton.promptIds.map((id, i) => ({
    id,
    type: 'prompt',
    position: { x: 0, y: 0 },
    config: { prompt: 'placeholder', stepKey: skeleton.customKeys[i] },
  }))
  return { nodes: [start, ...prompts], edges: skeleton.edges }
}

interface Defect {
  kind: 'collision' | 'duplicateStep' | 'malformedStep' | 'unresolvedRef'
  index: number
}

/**
 * With ~20% probability, injects exactly one deliberate defect so the
 * reject path (Run_Input/Step_Key collision, duplicate step key, malformed
 * step key, unresolved placeholder reference) is exercised too. These cases
 * are excluded from the accepted-graph assertions below via `fc.pre()`, but
 * are still generated and compiled through `graphToSteps`.
 */
const defectArbitrary: fc.Arbitrary<Defect | undefined> = fc.oneof(
  { arbitrary: fc.constant(undefined), weight: 4 },
  {
    arbitrary: fc
      .constantFrom<Defect['kind']>('collision', 'duplicateStep', 'malformedStep', 'unresolvedRef')
      .chain((kind) => fc.record({ kind: fc.constant(kind), index: fc.integer({ min: 0, max: 7 }) })),
    weight: 1,
  }
)

const graphArbitrary: fc.Arbitrary<{ graph: WorkflowGraph }> = fc
  .tuple(skeletonArbitrary, defectArbitrary, malformedKeyArbitrary)
  .chain(([skeleton, defect, malformedKey]) => {
    const skeletonGraph = buildSkeletonGraph(skeleton)
    const byId = new Map(skeletonGraph.nodes.map((n) => [n.id, n]))

    const runInputKeys = skeleton.runInputDefs.map((d) => d.key)

    // Computed from the *clean* skeleton, before any defect is applied, so
    // placeholders chosen below are guaranteed resolvable in the no-defect
    // case -- this is what keeps fc.pre()'s discard rate manageable.
    const availableKeysPerNode = skeleton.promptIds.map((id) => {
      const upstreamKeys = executableAncestors(skeletonGraph, id).map((aid) =>
        stepReferenceKey(byId.get(aid)!)
      )
      return [...new Set([...runInputKeys, ...upstreamKeys])]
    })

    const placeholderArbitraryForNode = (available: string[]): fc.Arbitrary<string[]> => {
      if (available.length === 0) return fc.constant<string[]>([])
      return fc.array(fc.constantFrom(...available), { minLength: 0, maxLength: 2 })
    }

    const promptPlaceholdersArbitrary = fc.tuple(
      ...availableKeysPerNode.map((available) => placeholderArbitraryForNode(available))
    )

    return promptPlaceholdersArbitrary.map((placeholderLists) => {
      const customKeys = [...skeleton.customKeys]
      const runInputDefs = [...skeleton.runInputDefs]
      const placeholders = placeholderLists.map((names) => [...names])

      if (defect) {
        const i = defect.index % skeleton.promptIds.length
        switch (defect.kind) {
          case 'collision': {
            if (runInputDefs.length > 0) {
              customKeys[i] = runInputDefs[defect.index % runInputDefs.length].key
            }
            break
          }
          case 'duplicateStep': {
            if (skeleton.promptIds.length > 1) {
              const j = (i + 1) % skeleton.promptIds.length
              const sharedKey = customKeys[i] ?? `dup_${i}`
              customKeys[i] = sharedKey
              customKeys[j] = sharedKey
            }
            break
          }
          case 'malformedStep': {
            customKeys[i] = malformedKey
            break
          }
          case 'unresolvedRef': {
            placeholders[i] = [...placeholders[i], 'definitely_unresolved_name']
            break
          }
        }
      }

      const promptNodes: GraphNode[] = skeleton.promptIds.map((id, idx) => {
        const names = placeholders[idx]
        const promptText = `Body text. ${names.map((n) => `{${n}}`).join(' ')}`.trim()
        return {
          id,
          type: 'prompt',
          position: { x: 0, y: 0 },
          config: { stepKey: customKeys[idx], prompt: promptText },
        }
      })

      const startNode: GraphNode = {
        id: 'start-1',
        type: 'start',
        position: { x: 0, y: 0 },
        config: { runInputs: runInputDefs },
      }

      const graph: WorkflowGraph = {
        nodes: [startNode, ...promptNodes],
        edges: skeleton.edges,
      }
      return { graph }
    })
  })

describe('Property 10: Accepted graphs have a well-formed, collision-free key namespace', () => {
  it('accepted graphs have disjoint Run_Input/Step_Reference keys, no duplicate step keys, and well-formed step keys', () => {
    let acceptedCount = 0

    fc.assert(
      fc.property(graphArbitrary, ({ graph }) => {
        const { steps, errors } = graphToSteps(graph)
        fc.pre(errors.length === 0)
        acceptedCount++

        const runInputKeys = getRunInputs(graph).map((d) => d.key)
        const stepKeys = steps.map((s) => s.step_key)

        // 1. Run_Input_Keys and Step_Reference_Keys are disjoint.
        const runInputKeySet = new Set(runInputKeys)
        for (const key of stepKeys) {
          expect(runInputKeySet.has(key)).toBe(false)
        }

        // 2. Step_Reference_Keys are pairwise distinct.
        expect(new Set(stepKeys).size).toBe(stepKeys.length)

        // 3. Every Step_Reference_Key is well-formed.
        for (const key of stepKeys) {
          expect(RUN_INPUT_KEY_PATTERN.test(key)).toBe(true)
          expect(key.length).toBeLessThanOrEqual(64)
        }
      }),
      { numRuns: 100 }
    )

    // Sanity check: the property actually had signal on the accept path,
    // rather than every case being discarded by fc.pre().
    expect(acceptedCount).toBeGreaterThan(0)
    console.log(`Property 10: ${acceptedCount} accepted-graph cases exercised (of up to 100 runs).`)
  })
})
