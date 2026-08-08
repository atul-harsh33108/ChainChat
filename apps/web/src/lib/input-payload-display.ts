export type InputValueKind = 'scalar' | 'array' | 'object'

/**
 * Classifies a JSON-compatible value for display on the Workflow Runs page.
 *
 * Req 9.1: scalar values, nested objects, and arrays must remain visually
 * distinguishable, so the caller can render arrays/objects as formatted JSON
 * and everything else inline.
 */
export function classifyInputValue(value: unknown): InputValueKind {
  if (Array.isArray(value)) return 'array'
  if (value !== null && typeof value === 'object') return 'object'
  return 'scalar'
}

/**
 * True when a run's `input_payload` should be displayed as "no inputs"
 * (Req 9.2, 10.3): absent, `null`, `undefined`, or an object with zero own
 * enumerable keys. A legacy execution with `input_payload: null` renders the
 * same "No inputs" state without throwing.
 */
export function hasNoInputs(payload: Record<string, unknown> | null | undefined): boolean {
  if (payload === null || payload === undefined) return true
  return Object.keys(payload).length === 0
}
