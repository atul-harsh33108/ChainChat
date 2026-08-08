// Feature: run-inputs-and-variables, Property 13: Renaming a Step_Reference_Key does not rewrite other prompts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { GraphEdge, GraphNode, WorkflowGraph } from '@/types'
import { graphToSteps } from '../graph'

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

const keyArbitrary = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => KEY_PATTERN.test(s))

/** Two distinct, valid Step_Reference_Keys: the upstream node's key before
 * (`oldKey`) and after (`newKey`) the author renames it. */
const keyPairArbitrary = fc
  .uniqueArray(keyArbitrary, { minLength: 2, maxLength: 2 })
  .map(([oldKey, newKey]) => ({ oldKey, newKey }))

interface GraphParams {
  upstreamPrompt: string
  downstreamPrompt: string
  extraPrompt: string
  includeExtraNode: boolean
}

/** A Start node feeding a Prompt node (upstream) that feeds another Prompt
 * node (downstream), so there is a genuine upstream/downstream relationship.
 * An optional third Prompt node hangs off the downstream node so the "every
 * node's prompt is unchanged" assertion covers more than just the two nodes
 * directly involved in the rename. */
function buildGraph(params: GraphParams): WorkflowGraph {
  const start: GraphNode = {
    id: 'start-1',
    type: 'start',
    position: { x: 0, y: 0 },
    config: {},
  }
  const upstream: GraphNode = {
    id: 'prompt-upstream',
    type: 'prompt',
    position: { x: 100, y: 0 },
    config: { prompt: params.upstreamPrompt, stepKey: 'placeholder' },
  }
  const downstream: GraphNode = {
    id: 'prompt-downstream',
    type: 'prompt',
    position: { x: 200, y: 0 },
    config: { prompt: params.downstreamPrompt },
  }

  const nodes: GraphNode[] = [start, upstream, downstream]
  const edges: GraphEdge[] = [
    { id: 'e-start-upstream', source: start.id, target: upstream.id },
    { id: 'e-upstream-downstream', source: upstream.id, target: downstream.id },
  ]

  if (params.includeExtraNode) {
    const extra: GraphNode = {
      id: 'prompt-extra',
      type: 'prompt',
      position: { x: 300, y: 0 },
      config: { prompt: params.extraPrompt },
    }
    nodes.push(extra)
    edges.push({ id: 'e-downstream-extra', source: downstream.id, target: extra.id })
  }

  return { nodes, edges }
}

describe('Property 13: Renaming a Step_Reference_Key does not rewrite other prompts', () => {
  it("leaves every node's config.prompt text byte-for-byte unchanged after a stepKey rename", () => {
    fc.assert(
      fc.property(
        keyPairArbitrary,
        fc.string({ maxLength: 30 }),
        fc.string({ maxLength: 30 }),
        fc.string({ maxLength: 30 }),
        fc.string({ maxLength: 30 }),
        fc.boolean(),
        (
          { oldKey, newKey },
          upstreamPrompt,
          prefixText,
          suffixText,
          extraPrompt,
          includeExtraNode
        ) => {
          // The downstream prompt references the upstream node's
          // Step_Reference_Key as a {oldKey} placeholder, before the rename.
          const downstreamPrompt = `${prefixText}{${oldKey}}${suffixText}`

          const graph = buildGraph({
            upstreamPrompt,
            downstreamPrompt,
            extraPrompt,
            includeExtraNode,
          })

          const upstreamNode = graph.nodes.find((n) => n.id === 'prompt-upstream')!
          upstreamNode.config = { ...upstreamNode.config, stepKey: oldKey }

          // Compile once before the rename, mirroring an author compiling,
          // then renaming, then compiling again.
          graphToSteps(graph)

          const promptsBefore = new Map(graph.nodes.map((n) => [n.id, n.config?.prompt]))

          // Simulate the author renaming the upstream node's Step_Reference_Key.
          upstreamNode.config = { ...upstreamNode.config, stepKey: newKey }

          graphToSteps(graph)

          // Every node's prompt text is byte-for-byte identical to what it
          // was before the rename -- graphToSteps never rewrites prompt text
          // in response to a stepKey change.
          for (const node of graph.nodes) {
            expect(node.config?.prompt).toBe(promptsBefore.get(node.id))
          }

          // The {oldKey} placeholder in the downstream prompt remains
          // literally {oldKey} -- it is not auto-updated to {newKey}.
          const downstreamNode = graph.nodes.find((n) => n.id === 'prompt-downstream')!
          expect(downstreamNode.config?.prompt).toBe(downstreamPrompt)
          expect(downstreamNode.config?.prompt).toContain(`{${oldKey}}`)
        }
      ),
      { numRuns: 100 }
    )
  })
})
