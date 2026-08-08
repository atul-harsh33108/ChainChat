// Output_Node execution (GAP-08 completion): an Output_Node becomes a real
// "format" step whose single upstream dependency's text it reformats, rather
// than being dropped from the compiled graph like Start/Decision nodes.
import { describe, it, expect } from 'vitest'
import type { GraphEdge, GraphNode, WorkflowGraph } from '@/types'
import { graphToSteps, isExecutable } from '../graph'

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

function outputNode(id: string, displayFormat?: 'text' | 'markdown' | 'json'): GraphNode {
  return {
    id,
    type: 'output',
    label: id,
    position: { x: 0, y: 0 },
    config: displayFormat ? { displayFormat } : {},
  }
}

describe('isExecutable', () => {
  it('treats output nodes as executable', () => {
    expect(isExecutable(outputNode('out'))).toBe(true)
  })

  it('still treats start and decision nodes as non-executable', () => {
    expect(isExecutable(startNode('start'))).toBe(false)
    expect(isExecutable({ id: 'd', type: 'decision', position: { x: 0, y: 0 } })).toBe(false)
  })
})

describe('graphToSteps: Output_Node -> "format" step', () => {
  it('produces a format step depending on its single upstream Prompt node', () => {
    const nodes = [startNode('start'), promptNode('summarize'), outputNode('display', 'markdown')]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'summarize' },
      { id: 'e2', source: 'summarize', target: 'display' },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { steps, errors } = graphToSteps(graph)
    expect(errors).toEqual([])

    const outputStep = steps.find((s) => s.step_key === 'display')!
    expect(outputStep.step_type).toBe('format')
    expect(outputStep.format).toBe('markdown')
    expect(outputStep.depends_on).toEqual(['summarize'])
    expect(outputStep.prompt).toBe('')
  })

  it('defaults format to "text" when the Output_Node has no displayFormat set', () => {
    const nodes = [startNode('start'), promptNode('summarize'), outputNode('display')]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'summarize' },
      { id: 'e2', source: 'summarize', target: 'display' },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { steps } = graphToSteps(graph)
    expect(steps.find((s) => s.step_key === 'display')!.format).toBe('text')
  })

  it('resolves depends_on transitively through an intervening Decision node', () => {
    const nodes = [
      startNode('start'),
      promptNode('extract'),
      { id: 'gate', type: 'decision' as const, position: { x: 0, y: 0 }, config: {} },
      outputNode('display'),
    ]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'gate' },
      {
        id: 'e3',
        source: 'gate',
        target: 'display',
        condition: { op: 'not_empty' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { steps, errors } = graphToSteps(graph)
    expect(errors).toEqual([])
    const outputStep = steps.find((s) => s.step_key === 'display')!
    expect(outputStep.depends_on).toEqual(['extract'])
    expect(outputStep.conditions).toEqual([
      { source_step: 'extract', op: 'not_empty', value: undefined },
    ])
  })

  it('errors when an Output_Node has zero upstream steps', () => {
    const nodes = [startNode('start'), outputNode('display')]
    const edges: GraphEdge[] = [{ id: 'e1', source: 'start', target: 'display' }]
    const graph: WorkflowGraph = { nodes, edges }

    const { errors } = graphToSteps(graph)
    expect(errors.some((e) => e.includes('must have exactly one upstream'))).toBe(true)
  })

  it('errors when an Output_Node has more than one upstream step', () => {
    const nodes = [
      startNode('start'),
      promptNode('a'),
      promptNode('b'),
      outputNode('display'),
    ]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'a' },
      { id: 'e2', source: 'start', target: 'b' },
      { id: 'e3', source: 'a', target: 'display' },
      { id: 'e4', source: 'b', target: 'display' },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { errors } = graphToSteps(graph)
    expect(errors.some((e) => e.includes('must have exactly one upstream'))).toBe(true)
  })

  it('an Output_Node can itself be a Decision_Node\'s branch source', () => {
    // extract -> display (format) -> gate (decision) -> escalate: the
    // decision's condition is evaluated against the Output_Node's
    // (formatted) text, exercising decisionSourceStepKey resolving to an
    // Output_Node rather than a Prompt_Node.
    const nodes = [
      startNode('start'),
      promptNode('extract'),
      outputNode('display', 'json'),
      { id: 'gate', type: 'decision' as const, position: { x: 0, y: 0 }, config: {} },
      promptNode('escalate'),
    ]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'extract' },
      { id: 'e2', source: 'extract', target: 'display' },
      { id: 'e3', source: 'display', target: 'gate' },
      {
        id: 'e4',
        source: 'gate',
        target: 'escalate',
        condition: { op: 'contains', value: 'urgent' },
      },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { steps, errors } = graphToSteps(graph)
    expect(errors).toEqual([])
    const escalateStep = steps.find((s) => s.step_key === 'escalate')!
    expect(escalateStep.conditions).toEqual([
      { source_step: 'display', op: 'contains', value: 'urgent' },
    ])
  })

  it('does not require prompt text on an Output_Node (no "has no prompt text" error)', () => {
    const nodes = [startNode('start'), promptNode('summarize'), outputNode('display')]
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'start', target: 'summarize' },
      { id: 'e2', source: 'summarize', target: 'display' },
    ]
    const graph: WorkflowGraph = { nodes, edges }

    const { errors } = graphToSteps(graph)
    expect(errors.some((e) => e.includes('has no prompt text'))).toBe(false)
  })
})
