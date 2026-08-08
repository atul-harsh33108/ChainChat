import type { GraphNode, RunInputDef, RunInputFieldType, WorkflowGraph } from '@/types'

/** A Run_Input_Key must be usable as a `{placeholder}` name. */
export const RUN_INPUT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Maximum number of Run_Inputs a single Start_Node may declare (Req 1.1, 1.12). */
export const MAX_RUN_INPUTS = 50

const VALID_FIELD_TYPES: RunInputFieldType[] = ['text', 'textarea', 'number', 'select']

/** The graph's single Start_Node, if any. */
export function getStartNode(graph: WorkflowGraph): GraphNode | undefined {
  return (graph.nodes || []).find((node) => node.type === 'start')
}

/** Declared Run_Inputs in order; [] for absent/null/empty config (Req 10.1). */
export function getRunInputs(graph: WorkflowGraph): RunInputDef[] {
  const startNode = getStartNode(graph)
  return startNode?.config?.runInputs ?? []
}

/** True iff `value` is missing/empty/all-whitespace (Req 3.1, 3.2). */
export function isBlank(value: string | undefined): boolean {
  return value === undefined || value === null || value.trim().length === 0
}

/**
 * Validates one candidate Run_Input against its would-be siblings.
 * Returns [] when valid, or human-readable reasons otherwise (Req 1.2-1.12).
 * Checks: non-empty/length-bounded key & label, key pattern, key uniqueness
 * against `siblings`, fieldType enum, select option count/uniqueness,
 * defaultValue conformance to fieldType, and the 50-Run_Input ceiling.
 */
export function validateRunInput(candidate: RunInputDef, siblings: RunInputDef[]): string[] {
  const reasons: string[] = []

  const key = candidate.key
  if (isBlank(key)) {
    reasons.push('Key is required.')
  } else {
    if (key.length > 64) {
      reasons.push('Key must be at most 64 characters.')
    }
    if (!RUN_INPUT_KEY_PATTERN.test(key)) {
      reasons.push('Key must match ^[A-Za-z_][A-Za-z0-9_]*$.')
    }
    if (siblings.some((sibling) => sibling.key === key)) {
      reasons.push(`Key "${key}" is already used by another Run Input.`)
    }
  }

  const label = candidate.label
  if (isBlank(label)) {
    reasons.push('Label is required.')
  } else if (label.length > 200) {
    reasons.push('Label must be at most 200 characters.')
  }

  if (!VALID_FIELD_TYPES.includes(candidate.fieldType)) {
    reasons.push('Field type must be one of text, textarea, number, or select.')
  }

  if (candidate.fieldType === 'select') {
    const options = candidate.options ?? []
    if (options.length < 1 || options.length > 100) {
      reasons.push('A select field must define between 1 and 100 options.')
    }
    if (new Set(options).size !== options.length) {
      reasons.push('Select options must be pairwise distinct.')
    }
    if (candidate.defaultValue !== undefined && !options.includes(String(candidate.defaultValue))) {
      reasons.push('Default value must be one of the defined options.')
    }
  } else if (candidate.fieldType === 'number' && candidate.defaultValue !== undefined) {
    if (isBlank(String(candidate.defaultValue)) || Number.isNaN(Number(candidate.defaultValue))) {
      reasons.push('Default value must be numeric for a number field.')
    }
  }

  if (siblings.length >= MAX_RUN_INPUTS) {
    reasons.push(`Cannot add more than ${MAX_RUN_INPUTS} Run Inputs.`)
  }

  return reasons
}

/**
 * Builds an Execution_Request's input_payload from Run_Dialog form state
 * (Req 8.1, 8.2): one entry per declared Run_Input, number-typed for
 * fieldType 'number', string otherwise, '' for a blank field with no default.
 */
export function buildInputPayload(
  defs: RunInputDef[],
  formValues: Record<string, string>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const def of defs) {
    const raw = formValues[def.key]
    const blank = isBlank(raw)

    if (blank && def.defaultValue === undefined) {
      payload[def.key] = ''
      continue
    }

    const effective = blank ? def.defaultValue : raw
    payload[def.key] = def.fieldType === 'number' ? Number(effective) : String(effective)
  }

  return payload
}
