export interface StepDependency {
  step_key: string
  depends_on: string[]
}

/**
 * Step_keys that no other step in `steps` depends on -- i.e. the leaves of
 * the depends_on DAG. These are the "final" results of a run: typically an
 * Output_Node's format step, or (when a workflow has no Output_Node) the
 * last Prompt_Node in a chain. Everything else is "intermediate": a step
 * whose result mainly exists to feed a later step, not to be read on its
 * own -- e.g. a Prompt_Node feeding straight into an Output_Node that just
 * reformats the same text.
 */
export function terminalStepKeys<T extends StepDependency>(steps: T[]): Set<string> {
  const referenced = new Set<string>()
  for (const step of steps) {
    for (const dep of step.depends_on || []) referenced.add(dep)
  }
  return new Set(
    steps.filter((step) => !referenced.has(step.step_key)).map((step) => step.step_key)
  )
}
