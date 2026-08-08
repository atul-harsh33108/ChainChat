// Feature: run-inputs-and-variables, Property 14: The Variable_Picker's entries are exactly the Run_Inputs plus upstream steps
//
// For any Workflow_Graph and any Prompt_Node, the set of entries offered by
// the Variable_Picker SHALL equal the union of the graph's Run_Input_Keys
// and the Step_Reference_Keys returned by executableAncestors() for that
// Prompt_Node, and SHALL never include that Prompt_Node's own
// Step_Reference_Key.
//
// **Validates: Requirements 7.1, 7.2**
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { GraphEdge, GraphNode, WorkflowGraph } from '@/types'
import { getRunInputs } from '@/lib/run-inputs'
import { executableAncestors, stepReferenceKey } from '../graph'

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const RESERVED_DERIVED_PATTERN = /^derived_\d+$/

/**
 * Valid Run_Input_Key / custom Step_Reference_Key candidates, excluding the
 * reserved `derived_<index>` names used below for id-derived Step_Reference_
 * Keys, so pool-assigned keys can never accidentally collide with a derived
 * one (or with each other, since the pool is drawn with `fc.uniqueArray`).
 * Keeping every key in the case globally unique means "the union of
 * Run_Input_Keys and upstream Step_Reference_Keys" and "the node's own key"
 * are unambiguous sets to compare against, without needing to separately
 * exercise the Requirement 5/6.4 collision-rejection behavior here (that is
 * Property 10's job).
 */
const keyArbitrary = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => KEY_PATTERN.test(s) && !RESERVED_DERIVED_PATTERN.test(s))

interface GraphCase {
  graph: WorkflowGraph
  nodeId: string
  runInputKeys: string[]
  stepReferenceKeys: string[] // index-aligned with the generated prompt nodes
  edges: [number, number][] // index pairs, source index < target index
  targetIndex: number
}

/**
 * Builds a Start_Node (declaring 0-5 Run_Inputs) plus 2-6 Prompt_Nodes
 * connected by forward-only edges (source index < target index). Forward-
 * only edges guarantee an acyclic graph and make "upstream of the target"
 * exactly "reachable by walking backward through edges from the target",
 * which lets the test compute that independently of
 * `executableAncestors`'s own traversal (see `upstreamIndices` below).
 * Degenerate self-referential/cyclic graphs are deliberately excluded from
 * generation, since a node can only ever be its own ancestor through such a
 * cycle and `executableAncestors`'s BFS has no way to produce that here.
 * Each Prompt_Node's Step_Reference_Key is either a pool-drawn custom key
 * or its id-derived `derived_<index>` key, and one Prompt_Node is chosen as
 * `nodeId` -- the node the Variable Picker is being computed for. Because
 * edges only ever point from a lower index to a higher one, every
 * higher-index Prompt_Node is guaranteed *not* upstream of the target, and
 * any lower-index node not selected by the random edge subset is a
 * disconnected sibling that must also be excluded -- both cases the
 * property below must correctly reject.
 */
const graphCaseArbitrary: fc.Arbitrary<GraphCase> = fc
  .integer({ min: 0, max: 5 })
  .chain((runInputCount) =>
    fc.integer({ min: 2, max: 6 }).chain((promptCount) =>
      fc
        .uniqueArray(keyArbitrary, {
          minLength: runInputCount + promptCount,
          maxLength: runInputCount + promptCount,
        })
        .chain((pool) => {
          const allPairs: [number, number][] = []
          for (let i = 0; i < promptCount; i++) {
            for (let j = i + 1; j < promptCount; j++) {
              allPairs.push([i, j])
            }
          }
          return fc
            .tuple(
              fc.array(fc.boolean(), { minLength: promptCount, maxLength: promptCount }),
              fc.subarray(allPairs),
              fc.integer({ min: 0, max: promptCount - 1 })
            )
            .map(([hasCustomKey, edgePairs, targetIndex]) => {
              const runInputKeys = pool.slice(0, runInputCount)
              const stepReferenceKeys = Array.from({ length: promptCount }, (_, i) =>
                hasCustomKey[i] ? pool[runInputCount + i] : `derived_${i}`
              )

              const startNode: GraphNode = {
                id: 'start-1',
                type: 'start',
                position: { x: 0, y: 0 },
                config: {
                  runInputs: runInputKeys.map((key, i) => ({
                    key,
                    label: `Input ${i}`,
                    fieldType: 'text',
                    required: false,
                  })),
                },
              }

              const promptNodes: GraphNode[] = Array.from({ length: promptCount }, (_, i) => ({
                id: `derived-${i}`,
                type: 'prompt',
                position: { x: 100 * (i + 1), y: 0 },
                config: hasCustomKey[i]
                  ? { prompt: `p${i}`, stepKey: stepReferenceKeys[i] }
                  : { prompt: `p${i}` },
              }))

              const edges: GraphEdge[] = edgePairs.map(([i, j]) => ({
                id: `e-${i}-${j}`,
                source: `derived-${i}`,
                target: `derived-${j}`,
              }))

              const graph: WorkflowGraph = {
                nodes: [startNode, ...promptNodes],
                edges,
              }

              return {
                graph,
                nodeId: `derived-${targetIndex}`,
                runInputKeys,
                stepReferenceKeys,
                edges: edgePairs,
                targetIndex,
              }
            })
        })
    )
  )

/**
 * Independent reachability oracle: the indices of prompt nodes directly
 * feeding `target` via an incoming edge. Computed straight from the raw
 * edge list rather than by calling `executableAncestors`, so it verifies
 * inclusion/exclusion independently of the function under test.
 *
 * Every generated node in `graphCaseArbitrary` (besides the Start_Node,
 * which never participates in an edge here) is itself an executable
 * Prompt_Node, so `executableAncestors`'s BFS -- which walks backward
 * through incoming edges but stops at (and collects) the first executable
 * node on each path without continuing past it -- reduces to exactly "the
 * set of direct incoming-edge predecessors of `target`" in this test's
 * graphs: it never has a non-executable intermediate node to walk through.
 * This is what makes the oracle here independent of the implementation
 * while still matching its documented semantics: a downstream-only node
 * (reachable only by walking forward from `target`) or a disconnected
 * sibling (no edge path to `target` at all) correctly has no direct edge
 * into `target` and so is correctly excluded.
 */
function upstreamIndices(edges: [number, number][], target: number): Set<number> {
  const direct = edges.filter(([, j]) => j === target).map(([i]) => i)
  return new Set(direct)
}

describe("Property 14: the Variable_Picker's entries are exactly the Run_Inputs plus upstream steps", () => {
  it('equals the union of Run_Input_Keys and upstream Step_Reference_Keys, excluding the node itself', () => {
    fc.assert(
      fc.property(graphCaseArbitrary, (testCase) => {
        const { graph, nodeId, runInputKeys, stepReferenceKeys, edges, targetIndex } = testCase
        const byId = new Map(graph.nodes.map((n) => [n.id, n]))

        const actualEntries = [
          ...getRunInputs(graph).map((d) => d.key),
          ...executableAncestors(graph, nodeId).map((id) => stepReferenceKey(byId.get(id)!)),
        ]

        const expectedUpstreamKeys = [...upstreamIndices(edges, targetIndex)].map(
          (i) => stepReferenceKeys[i]
        )
        const expectedEntries = new Set([...runInputKeys, ...expectedUpstreamKeys])

        // The computed entries, as a set, are exactly the union of
        // Run_Input_Keys and the target node's upstream Step_Reference_Keys
        // -- no downstream-only node, disconnected sibling, or spurious
        // entry leaks in, and no genuine upstream/Run_Input entry is missing.
        expect(new Set(actualEntries)).toEqual(expectedEntries)

        // The node's own Step_Reference_Key never appears among its own
        // entries (it is never its own upstream ancestor, and every pool
        // key/derived key in this case is globally unique, so there is no
        // coincidental collision with a Run_Input_Key either).
        const ownKey = stepReferenceKeys[targetIndex]
        expect(actualEntries).not.toContain(ownKey)
      }),
      { numRuns: 100 }
    )
  })
})
