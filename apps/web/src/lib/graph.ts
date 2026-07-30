import type { GraphEdge, GraphNode, WorkflowGraph } from '@/types'

export const FREE_MODELS = [
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra (free)' },
] as const

export const DEFAULT_MODEL = FREE_MODELS[0].id

/** Provider key understood by the execution service registry. */
const PROVIDER = 'openrouter'

/** Only prompt nodes produce an execution step. */
export function isExecutable(node: GraphNode): boolean {
  return node.type === 'prompt'
}

/**
 * Execution step keys must be safe to use as Python ``str.format`` field names,
 * because the engine renders prompts with the accumulated context.
 */
export function toStepKey(nodeId: string): string {
  const cleaned = nodeId.replace(/[^A-Za-z0-9_]/g, '_')
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `n_${cleaned}`
}

export interface ExecutionStepPayload {
  step_key: string
  depends_on: string[]
  provider: string
  model_key: string
  prompt: string
  inputs: Record<string, unknown>
}

export interface BuildResult {
  steps: ExecutionStepPayload[]
  errors: string[]
}

/**
 * Convert a builder graph into execution steps.
 *
 * Non-executable nodes (start/decision/output) are not steps, so dependencies
 * are resolved transitively through them. Otherwise the engine would reject the
 * run with "Unknown dependency".
 */
export function graphToSteps(graph: WorkflowGraph): BuildResult {
  const errors: string[] = []
  const nodes = graph.nodes || []
  const edges: GraphEdge[] = graph.edges || []

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const executable = nodes.filter(isExecutable)

  if (executable.length === 0) {
    errors.push('Add at least one Prompt node before running.')
    return { steps: [], errors }
  }

  // Incoming edges per node.
  const incoming = new Map<string, string[]>()
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    incoming.set(e.target, [...(incoming.get(e.target) || []), e.source])
  }

  /** Walk upstream until an executable ancestor is found. */
  function executableAncestors(nodeId: string): string[] {
    const found = new Set<string>()
    const seen = new Set<string>([nodeId])
    const queue = [...(incoming.get(nodeId) || [])]

    while (queue.length) {
      const current = queue.shift()!
      if (seen.has(current)) continue
      seen.add(current)

      const node = byId.get(current)
      if (!node) continue
      if (isExecutable(node)) {
        found.add(current)
        continue // stop: its own deps are handled by its own step
      }
      queue.push(...(incoming.get(current) || []))
    }
    return [...found]
  }

  const steps: ExecutionStepPayload[] = executable.map((node) => {
    const prompt = node.config?.prompt?.trim() || ''
    if (!prompt) {
      errors.push(`Node "${node.label || node.id}" has no prompt text.`)
    }
    return {
      step_key: toStepKey(node.id),
      depends_on: executableAncestors(node.id).map(toStepKey),
      provider: PROVIDER,
      model_key: node.config?.model || DEFAULT_MODEL,
      prompt,
      inputs: {},
    }
  })

  // Duplicate keys would violate the (execution_id, step_key) unique constraint.
  const keys = steps.map((s) => s.step_key)
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
  if (dupes.length) {
    errors.push(`Duplicate step keys: ${[...new Set(dupes)].join(', ')}`)
  }

  return { steps, errors }
}

/** Newest version (highest version_number) of a workflow, if any. */
export function latestVersion<T extends { version_number: number }>(
  versions: T[] | undefined
): T | undefined {
  if (!versions?.length) return undefined
  return [...versions].sort((a, b) => b.version_number - a.version_number)[0]
}

export const EMPTY_GRAPH: WorkflowGraph = { nodes: [], edges: [] }
