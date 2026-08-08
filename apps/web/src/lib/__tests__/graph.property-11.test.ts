// Feature: run-inputs-and-variables, Property 11: Every recognised placeholder in an accepted graph resolves to a declared name
//
// For any Workflow_Graph accepted by the Graph_Compiler
// (graphToSteps(graph).errors.length === 0), every recognised {name}
// placeholder appearing in any Prompt_Node's prompt text resolves to
// either a declared Run_Input_Key or an Upstream_Variable's
// Step_Reference_Key -- i.e. extractPlaceholders never finds a name
// outside that node's Run_Input_Keys u executableAncestors(...).map(
// stepReferenceKey) in an accepted graph.
//
// **Validates: Requirements 6.6**
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { GraphEdge, GraphNode, WorkflowGraph } from '@/types'
import { DEFAULT_MODEL, executableAncestors, extractPlaceholders, graphToSteps, stepReferenceKey } from '../graph'
import { getRunInputs } from '../run-inputs'

/** Lowercase-letter identifiers, used to build Run_Input keys and salts for
 * placeholder names -- short and cheap for fast-check to shrink. */
const lowerIdent = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split('')), { minLength: 1, maxLength: 8 })
  .map((chars) => chars.join(''))

/** 0-5 pairwise-distinct Run_Input keys, all prefixed `ri_` so they can
 * never collide with the `pnode_<i>`-derived Step_Reference_Keys below. */
const runInputKeysArbitrary: fc.Arbitrary<string[]> = fc
  .uniqueArray(lowerIdent, { minLength: 0, maxLength: 5 })
  .map((suffixes) => suffixes.map((s) => `ri_${s}`))

interface TokenSpec {
  /** Whether this token *attempts* to reference an available key. When no
   * key is available for the node (e.g. the first Prompt node with no
   * declared Run_Inputs), the token falls back to an unresolved reference
   * regardless of this flag -- there is nothing valid to reference. */
  valid: boolean
  salt: string
}

/** A single placeholder token. Biased 90/10 toward "reference an available
 * key" so accepted graphs (errors.length === 0) are exercised often, while
 * still occasionally injecting an unresolved reference to exercise the
 * rejection path. */
const tokenSpecArbitrary: fc.Arbitrary<TokenSpec> = fc.record({
  valid: fc.oneof(
    { weight: 9, arbitrary: fc.constant(true) },
    { weight: 1, arbitrary: fc.constant(false) }
  ),
  salt: lowerIdent,
})

/** promptCount in [1, 5], a set of Run_Input keys, and, for each Prompt
 * node in the chain, 0-3 placeholder token specs for that node's prompt. */
const caseArbitrary: fc.Arbitrary<[number, string[], TokenSpec[][]]> = fc
  .integer({ min: 1, max: 5 })
  .chain((promptCount) =>
    fc.tuple(
      fc.constant(promptCount),
      runInputKeysArbitrary,
      fc.array(fc.array(tokenSpecArbitrary, { minLength: 0, maxLength: 3 }), {
        minLength: promptCount,
        maxLength: promptCount,
      })
    )
  )

/** Deterministically picks an index in [0, length) from a salt string, so
 * placeholder selection is reproducible/shrinkable without extra fc state. */
function saltToIndex(salt: string, length: number): number {
  let sum = 0
  for (const ch of salt) sum += ch.charCodeAt(0)
  return sum % length
}

/**
 * Builds a linear-chain Workflow_Graph: a Start node (declaring
 * `runInputKeys` as Run_Inputs) feeding a chain of `promptCount` Prompt
 * nodes (pnode_0 -> pnode_1 -> ... -> pnode_{promptCount-1}), none of which
 * set a custom Step_Reference_Key. Each Prompt node's prompt text is built
 * from its token specs: a "valid" token references a key drawn from that
 * node's *actual* available-keys set (Run_Input_Keys u
 * executableAncestors(...).map(stepReferenceKey), computed via graph.ts's
 * own exported functions), and any other token references an `unresolved_`
 * name guaranteed not to be in that set.
 */
function buildCase(promptCount: number, runInputKeys: string[], perNodeTokens: TokenSpec[][]): WorkflowGraph {
  const startNode: GraphNode = {
    id: 'start-1',
    type: 'start',
    position: { x: 0, y: 0 },
    config: {
      runInputs: runInputKeys.map((key) => ({
        key,
        label: key,
        fieldType: 'text' as const,
        required: false,
      })),
    },
  }

  const promptNodes: GraphNode[] = []
  for (let i = 0; i < promptCount; i++) {
    promptNodes.push({
      id: `pnode_${i}`,
      type: 'prompt',
      position: { x: (i + 1) * 100, y: 0 },
      config: { model: DEFAULT_MODEL, prompt: '' },
    })
  }

  const nodes: GraphNode[] = [startNode, ...promptNodes]
  const edges: GraphEdge[] = [{ id: 'e_start_0', source: 'start-1', target: 'pnode_0' }]
  for (let i = 1; i < promptCount; i++) {
    edges.push({ id: `e_${i - 1}_${i}`, source: `pnode_${i - 1}`, target: `pnode_${i}` })
  }

  const graph: WorkflowGraph = { nodes, edges }

  for (let i = 0; i < promptCount; i++) {
    const node = promptNodes[i]
    const availableKeys = new Set([
      ...getRunInputs(graph).map((d) => d.key),
      ...executableAncestors(graph, node.id).map((id) =>
        stepReferenceKey(nodes.find((n) => n.id === id)!)
      ),
    ])
    const availableList = [...availableKeys]

    const parts: string[] = [`seg_${i}_`]
    for (const token of perNodeTokens[i]) {
      if (token.valid && availableList.length > 0) {
        const chosen = availableList[saltToIndex(token.salt, availableList.length)]
        parts.push(`{${chosen}}`)
      } else {
        let name = `unresolved_${token.salt}`
        if (availableKeys.has(name)) name += '_x'
        parts.push(`{${name}}`)
      }
      parts.push('_mid_')
    }
    node.config = { ...node.config, prompt: parts.join('') }
  }

  return graph
}

describe('Property 11: every recognised placeholder in an accepted graph resolves to a declared name', () => {
  let acceptedCases = 0
  let totalCases = 0

  it('never accepts a graph containing a placeholder outside Run_Input_Keys u Upstream_Variable keys', () => {
    fc.assert(
      fc.property(caseArbitrary, ([promptCount, runInputKeys, perNodeTokens]) => {
        totalCases++
        const graph = buildCase(promptCount, runInputKeys, perNodeTokens)
        const result = graphToSteps(graph)

        // Only accepted graphs are in scope for this property -- rejected
        // graphs (e.g. containing a deliberately unresolved placeholder)
        // are discarded rather than asserted on.
        fc.pre(result.errors.length === 0)
        acceptedCases++

        const runInputKeySet = new Set(getRunInputs(graph).map((d) => d.key))
        const promptNodes = graph.nodes.filter((n) => n.type === 'prompt')

        for (const node of promptNodes) {
          const availableKeys = new Set([
            ...runInputKeySet,
            ...executableAncestors(graph, node.id).map((id) =>
              stepReferenceKey(graph.nodes.find((n) => n.id === id)!)
            ),
          ])

          const placeholders = extractPlaceholders(node.config?.prompt || '')
          for (const name of placeholders) {
            expect(availableKeys.has(name)).toBe(true)
          }
        }
      }),
      { numRuns: 100 }
    )

    // Sanity check: the biasing toward valid references actually produces
    // a meaningful number of accepted (non-discarded) cases to assert on,
    // rather than every run being thrown away by fc.pre.
    expect(acceptedCases).toBeGreaterThan(0)
    expect(totalCases).toBeGreaterThan(0)
  })
})
