import type { GraphEdge, GraphNode, WorkflowGraph } from '@/types'
import { getRunInputs, RUN_INPUT_KEY_PATTERN } from '@/lib/run-inputs'

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

/** Node-id -> node lookup map for a graph. */
function buildById(graph: WorkflowGraph): Map<string, GraphNode> {
  return new Map((graph.nodes || []).map((n) => [n.id, n]))
}

/** Incoming-edges-per-node map for a graph. */
function buildIncoming(
  graph: WorkflowGraph,
  byId: Map<string, GraphNode>
): Map<string, string[]> {
  const incoming = new Map<string, string[]>()
  for (const e of (graph.edges || []) as GraphEdge[]) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    incoming.set(e.target, [...(incoming.get(e.target) || []), e.source])
  }
  return incoming
}

/**
 * Prompt_Node ids transitively reachable upstream through non-executable
 * nodes, stopping at (and collecting) the first executable ancestor on each
 * path. Used both by `graphToSteps` for `depends_on` and by the Variable
 * Picker for its list of referenceable upstream steps.
 */
export function executableAncestors(graph: WorkflowGraph, nodeId: string): string[] {
  const byId = buildById(graph)
  const incoming = buildIncoming(graph, byId)

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

/**
 * A Prompt_Node's Step_Reference_Key: its custom `config.stepKey` if set and
 * non-empty (after trimming), else the id-derived `toStepKey(node.id)`.
 */
export function stepReferenceKey(node: GraphNode): string {
  const custom = node.config?.stepKey?.trim()
  return custom ? custom : toStepKey(node.id)
}

const IDENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Names of every recognised placeholder in `template`.
 *
 * Mirrors the backend's `render_prompt`/`extract_placeholder_names` in
 * `rendering.py`: a single left-to-right bracket-matching pass identifies
 * "top level" (non-nested) `{...}` pairs, then a pair's content counts as a
 * recognised placeholder name only if it is a valid identifier matching
 * `^[A-Za-z_][A-Za-z0-9_]*$` and is not immediately adjacent to another
 * brace (rejecting doubled `{{`/`}}`, including the ambiguous trailing
 * `{name}}` case). Unlike the backend, this never substitutes -- it only
 * extracts names, since it exists purely for client-side reference
 * validation. This intentionally duplicates the backend's bracket-matching
 * rule rather than sharing code across the Python/TypeScript boundary; see
 * `fixtures/placeholder-extraction-cases.json` for the shared test cases
 * that keep the two implementations in sync.
 */
export function extractPlaceholders(template: string): string[] {
  if (!template) return []

  const n = template.length
  const openStack: number[] = []
  const topLevelPairs = new Map<number, number>()

  for (let i = 0; i < n; i++) {
    const ch = template[i]
    if (ch === '{') {
      openStack.push(i)
    } else if (ch === '}') {
      if (openStack.length === 0) continue // unmatched '}': ignore
      const openIdx = openStack.pop()!
      if (openStack.length === 0) {
        topLevelPairs.set(openIdx, i)
      }
      // else: nested inside an outer, still-open '{' -- not recorded.
    }
  }

  const names: string[] = []
  for (const [openIdx, closeIdx] of topLevelPairs) {
    const name = template.slice(openIdx + 1, closeIdx)
    const doubled =
      (openIdx > 0 && template[openIdx - 1] === '{') ||
      (closeIdx + 1 < n && template[closeIdx + 1] === '}')
    if (IDENT_PATTERN.test(name) && !doubled) {
      names.push(name)
    }
  }
  return names
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

  const byId = buildById(graph)
  const executable = nodes.filter(isExecutable)

  if (executable.length === 0) {
    errors.push('Add at least one Prompt node before running.')
    return { steps: [], errors }
  }

  const steps: ExecutionStepPayload[] = executable.map((node) => {
    const prompt = node.config?.prompt?.trim() || ''
    if (!prompt) {
      errors.push(`Node "${node.label || node.id}" has no prompt text.`)
    }
    return {
      step_key: stepReferenceKey(node),
      depends_on: executableAncestors(graph, node.id).map((id) =>
        stepReferenceKey(byId.get(id)!)
      ),
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

  // Reference-key collisions (Req 5, 6.4): a Run_Input_Key must never be
  // identical to any Prompt node's Step_Reference_Key. Duplicated
  // Step_Reference_Keys across two or more Prompt nodes are already
  // reported above by the "Duplicate step keys" check, so this only adds
  // the Run_Input-vs-Step_Reference_Key collision, not a redundant restate
  // of that same duplication.
  const runInputKeys = getRunInputs(graph).map((d) => d.key)
  const stepKeySet = new Set(keys)
  const collidingKeys = [...new Set(runInputKeys.filter((k) => stepKeySet.has(k)))]
  for (const key of collidingKeys) {
    errors.push(`Run_Input key "${key}" collides with a Prompt node's Step_Reference_Key.`)
  }

  // Reference-key well-formedness (Req 6.3, defense in depth): every
  // Step_Reference_Key -- custom or id-derived -- must match the same
  // pattern/length rule enforced at Run_Input-key entry time.
  executable.forEach((node, i) => {
    const key = keys[i]
    if (!RUN_INPUT_KEY_PATTERN.test(key) || key.length > 64) {
      errors.push(
        `Step Reference Key "${key}" on node "${node.label || node.id}" must match ` +
          `^[A-Za-z_][A-Za-z0-9_]*$ and be at most 64 characters.`
      )
    }
  })

  // Unresolved placeholder references (Req 6.6): every recognised
  // placeholder in a Prompt node's prompt text must resolve to a declared
  // Run_Input_Key or an upstream Prompt node's Step_Reference_Key.
  const runInputKeySet = new Set(runInputKeys)
  for (const node of executable) {
    const placeholders = extractPlaceholders(node.config?.prompt || '')
    if (placeholders.length === 0) continue

    const availableKeys = new Set(runInputKeySet)
    for (const ancestorId of executableAncestors(graph, node.id)) {
      availableKeys.add(stepReferenceKey(byId.get(ancestorId)!))
    }

    for (const name of placeholders) {
      if (!availableKeys.has(name)) {
        errors.push(`Node "${node.label || node.id}" references unresolved variable "{${name}}".`)
      }
    }
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
