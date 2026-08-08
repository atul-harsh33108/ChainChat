import { describe, it, expect } from 'vitest'
import type { GraphEdge, GraphNode, WorkflowGraph } from '@/types'
import { conditionsForNode, graphToSteps } from '../graph'

/** Minimal Start node, satisfying no particular shape requirement. */
function startNode(id: string): GraphNode {
  return { id, type: 'start', label: 'Start', position: { x: 0, y: 0 }, config: {} }
}

function promptNode(id: string, prompt = 'do something'): GraphNode {
  return {
    id,
    type: 'prompt',
    label: id,
    position: { x: 0, y: 0 },
    config: { model: 'google/gemma-4-31b-it:free', prompt },
  }
}

function decisionNode(id: string): GraphNode {
  return { id, type: 'decision', label: id, position: { x: 0, y: 0 }, config: {} }
}

describe('conditionsForNode', () => {
  it('returns no conditions for a node with no decision ancestors', () => {
    const nodes = [startNode('start'), promptNode('extract')]
    const edges: GraphEdge[] = [{ id: 'e1', source: 'start', target: 'extract' }]
    const graph: WorkflowGraph = { nodes, edges }

    expect(conditionsForNode(graph, 'extract')).toEqual([])
  })

  it('attaches a single condition through one decision node', () => {
    const nodes = [startNode('start'), promptNode('extract'), decisionNode('is_urgent'), promptNode('escalate')]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'is_urgent' },
      {
        id: 'e3',
        source: 'is_urgent',
        target: 'escalate',
        condition: { op: 'contains', value: 'urgent' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    expect(conditionsForNode(graph, 'escalate')).toEqual([
      { source_step: 'extract', op: 'contains', value: 'urgent' },
    ])
  })

  it('does not attach a condition for an unconditioned edge leaving a decision node', () => {
    const nodes = [startNode('start'), promptNode('extract'), decisionNode('is_urgent'), promptNode('fallback')]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'is_urgent' },
      { id: 'e3', source: 'is_urgent', target: 'fallback' }, // no condition set
    ]
    const graph: WorkflowGraph = { nodes, edges }

    expect(conditionsForNode(graph, 'fallback')).toEqual([])
  })

  it('gates each step only on its immediately upstream decision, since an intermediate Prompt node already carries its own gate', () => {
    // extract -> is_urgent -> classify -> is_bug -> file_ticket. classify's
    // gate (via is_urgent) lives on classify's own step; file_ticket depends
    // on classify (via depends_on) so the engine's cascade-skip propagates
    // that gate automatically without file_ticket re-stating it.
    const nodes = [
      startNode('start'),
      promptNode('extract'),
      decisionNode('is_urgent'),
      promptNode('classify'),
      decisionNode('is_bug'),
      promptNode('file_ticket'),
    ]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'is_urgent' },
      {
        id: 'e3',
        source: 'is_urgent',
        target: 'classify',
        condition: { op: 'contains', value: 'urgent' },
      },
      { id: 'e4', source: 'classify', target: 'is_bug' },
      {
        id: 'e5',
        source: 'is_bug',
        target: 'file_ticket',
        condition: { op: 'equals', value: 'bug' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    expect(conditionsForNode(graph, 'classify')).toEqual([
      { source_step: 'extract', op: 'contains', value: 'urgent' },
    ])
    expect(conditionsForNode(graph, 'file_ticket')).toEqual([
      { source_step: 'classify', op: 'equals', value: 'bug' },
    ])
  })

  it('stacks multiple AND-ed conditions when two decisions sit back-to-back with no Prompt node between them', () => {
    // extract -> is_urgent -> is_bug -> file_ticket: no Prompt node between
    // the two decisions, so both conditions gate the same downstream step.
    const nodes = [
      startNode('start'),
      promptNode('extract'),
      decisionNode('is_urgent'),
      decisionNode('is_bug'),
      promptNode('file_ticket'),
    ]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'is_urgent' },
      {
        id: 'e3',
        source: 'is_urgent',
        target: 'is_bug',
        condition: { op: 'contains', value: 'urgent' },
      },
      {
        id: 'e4',
        source: 'is_bug',
        target: 'file_ticket',
        condition: { op: 'equals', value: 'bug' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const conditions = conditionsForNode(graph, 'file_ticket')
    expect(conditions).toHaveLength(2)
    expect(conditions).toEqual(
      expect.arrayContaining([
        { source_step: 'extract', op: 'contains', value: 'urgent' },
        { source_step: 'extract', op: 'equals', value: 'bug' },
      ])
    )
  })

  it('does not attach a condition when the decision has no single Prompt ancestor', () => {
    // Decision fed directly by Start (zero Prompt ancestors) -- source_step
    // is unresolvable, so the condition is dropped rather than guessed at.
    // graphToSteps separately reports this as a validation error.
    const nodes = [startNode('start'), decisionNode('gate'), promptNode('escalate')]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'gate' },
      {
        id: 'e2',
        source: 'gate',
        target: 'escalate',
        condition: { op: 'not_empty' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    expect(conditionsForNode(graph, 'escalate')).toEqual([])
  })

  it('deduplicates an identical condition reached via two paths', () => {
    const nodes = [
      startNode('start'),
      promptNode('extract'),
      decisionNode('is_urgent_a'),
      decisionNode('is_urgent_b'),
      promptNode('escalate'),
    ]
    const sameCondition = { op: 'contains' as const, value: 'urgent' }
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'is_urgent_a' },
      { id: 'e3', source: 'extract', target: 'is_urgent_b' },
      { id: 'e4', source: 'is_urgent_a', target: 'escalate', condition: sameCondition },
      { id: 'e5', source: 'is_urgent_b', target: 'escalate', condition: sameCondition },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    expect(conditionsForNode(graph, 'escalate')).toEqual([
      { source_step: 'extract', op: 'contains', value: 'urgent' },
    ])
  })
})

describe('graphToSteps: decision-node validation and propagation', () => {
  it('attaches the resolved condition to the downstream step payload', () => {
    const nodes = [
      startNode('start'),
      promptNode('extract', 'Extract sentiment from this message.'),
      decisionNode('is_urgent'),
      promptNode('escalate', 'Escalate: {extract}'),
    ]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'is_urgent' },
      {
        id: 'e3',
        source: 'is_urgent',
        target: 'escalate',
        condition: { op: 'contains', value: 'urgent' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { steps, errors } = graphToSteps(graph)
    expect(errors).toEqual([])
    const escalateStep = steps.find((s) => s.step_key === 'escalate')!
    expect(escalateStep.conditions).toEqual([
      { source_step: 'extract', op: 'contains', value: 'urgent' },
    ])
    const extractStep = steps.find((s) => s.step_key === 'extract')!
    expect(extractStep.conditions).toEqual([])
  })

  it('errors when a decision node has zero upstream Prompt nodes', () => {
    const nodes = [startNode('start'), decisionNode('gate'), promptNode('escalate')]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'gate' },
      {
        id: 'e2',
        source: 'gate',
        target: 'escalate',
        condition: { op: 'not_empty' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { errors } = graphToSteps(graph)
    expect(errors.some((e) => e.includes('must have exactly one upstream'))).toBe(true)
  })

  it('errors when a decision node has more than one upstream Prompt node', () => {
    const nodes = [
      startNode('start'),
      promptNode('extract_a'),
      promptNode('extract_b'),
      decisionNode('gate'),
      promptNode('escalate'),
    ]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract_a' },
      { id: 'e2', source: 'start', target: 'extract_b' },
      { id: 'e3', source: 'extract_a', target: 'gate' },
      { id: 'e4', source: 'extract_b', target: 'gate' },
      {
        id: 'e5',
        source: 'gate',
        target: 'escalate',
        condition: { op: 'not_empty' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { errors } = graphToSteps(graph)
    expect(errors.some((e) => e.includes('must have exactly one upstream'))).toBe(true)
  })

  it('errors when a decision node has no condition on any outgoing edge', () => {
    const nodes = [startNode('start'), promptNode('extract'), decisionNode('gate'), promptNode('escalate')]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'gate' },
      { id: 'e3', source: 'gate', target: 'escalate' }, // no condition
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { errors } = graphToSteps(graph)
    expect(errors.some((e) => e.includes('has no condition set'))).toBe(true)
  })

  it('accepts a well-formed decision node with no other errors', () => {
    const nodes = [
      startNode('start'),
      promptNode('extract', 'Extract sentiment from this message.'),
      decisionNode('is_urgent'),
      promptNode('escalate', 'Escalate: {extract}'),
    ]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'is_urgent' },
      {
        id: 'e3',
        source: 'is_urgent',
        target: 'escalate',
        condition: { op: 'contains', value: 'urgent' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { errors } = graphToSteps(graph)
    expect(errors).toEqual([])
  })
})
