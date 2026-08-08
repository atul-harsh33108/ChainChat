// Regression test for legacy graphs: a Workflow_Graph saved before this
// feature shipped (no `runInputs` on the Start_Node's config, no `stepKey`
// on any Prompt_Node) must still compile via graphToSteps to the same
// number of steps, in the same order, with the same step_key values it
// produced before this feature (derived toStepKey(node.id) for every step).
//
// _Requirements: Requirement 10 (Criteria 1, 2)_
import { describe, it, expect } from 'vitest'
import type { WorkflowGraph } from '@/types'
import { graphToSteps, toStepKey } from '../graph'
import { getRunInputs } from '../run-inputs'

/**
 * A plain "legacy-shaped" graph: a Start node with `config: {}` (no
 * `runInputs` key at all) and three Prompt nodes with only `model`/`prompt`
 * in their config (no `stepKey`), connected linearly by edges -- exactly
 * what a workflow saved before this feature would look like.
 */
const legacyGraph: WorkflowGraph = {
  nodes: [
    {
      id: 'start-1',
      type: 'start',
      label: 'Start',
      position: { x: 0, y: 0 },
      config: {},
    },
    {
      id: 'prompt_lx8z1k',
      type: 'prompt',
      label: 'First prompt',
      position: { x: 200, y: 0 },
      config: {
        model: 'google/gemma-4-31b-it:free',
        prompt: 'Summarize the input.',
      },
    },
    {
      id: 'prompt_9f2a7c',
      type: 'prompt',
      label: 'Second prompt',
      position: { x: 400, y: 0 },
      config: {
        model: 'google/gemma-4-31b-it:free',
        prompt: 'Expand on the summary.',
      },
    },
    {
      id: 'prompt_0mq3vd',
      type: 'prompt',
      label: 'Third prompt',
      position: { x: 600, y: 0 },
      config: {
        model: 'google/gemma-4-31b-it:free',
        prompt: 'Finalize the result.',
      },
    },
  ],
  edges: [
    { id: 'e1', source: 'start-1', target: 'prompt_lx8z1k' },
    { id: 'e2', source: 'prompt_lx8z1k', target: 'prompt_9f2a7c' },
    { id: 'e3', source: 'prompt_9f2a7c', target: 'prompt_0mq3vd' },
  ],
}

describe('legacy graphs compile unchanged (Requirement 10.1, 10.2)', () => {
  it('accepts the legacy graph with no validation errors', () => {
    const result = graphToSteps(legacyGraph)
    expect(result.errors).toEqual([])
  })

  it('produces one step per Prompt node', () => {
    const promptNodes = legacyGraph.nodes.filter((n) => n.type === 'prompt')
    const result = graphToSteps(legacyGraph)
    expect(result.steps.length).toBe(promptNodes.length)
  })

  it('produces steps in the same order the Prompt nodes appear in graph.nodes', () => {
    const promptNodes = legacyGraph.nodes.filter((n) => n.type === 'prompt')
    const result = graphToSteps(legacyGraph)
    expect(result.steps.map((s) => s.step_key)).toEqual(
      promptNodes.map((n) => toStepKey(n.id))
    )
  })

  it("derives each step's step_key from toStepKey(node.id)", () => {
    const promptNodes = legacyGraph.nodes.filter((n) => n.type === 'prompt')
    const result = graphToSteps(legacyGraph)
    result.steps.forEach((step, i) => {
      expect(step.step_key).toBe(toStepKey(promptNodes[i].id))
    })
  })

  it('treats the legacy Start node as declaring zero Run_Inputs (Requirement 10.1)', () => {
    expect(getRunInputs(legacyGraph)).toEqual([])
  })
})
