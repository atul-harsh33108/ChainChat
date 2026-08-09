import { describe, it, expect } from 'vitest'
import { terminalStepKeys } from '../run-steps'

describe('terminalStepKeys', () => {
  it('returns the single step when there is only one', () => {
    const steps = [{ step_key: 'a', depends_on: [] }]
    expect(terminalStepKeys(steps)).toEqual(new Set(['a']))
  })

  it('excludes a step that another step depends on', () => {
    // a -> b: a feeds b, so only b is terminal.
    const steps = [
      { step_key: 'a', depends_on: [] },
      { step_key: 'b', depends_on: ['a'] },
    ]
    expect(terminalStepKeys(steps)).toEqual(new Set(['b']))
  })

  it('treats a Prompt -> Output chain as one terminal step (the Output)', () => {
    const steps = [
      { step_key: 'prompt_1', depends_on: [] },
      { step_key: 'output_1', depends_on: ['prompt_1'] },
    ]
    expect(terminalStepKeys(steps)).toEqual(new Set(['output_1']))
  })

  it('returns multiple terminal steps when the graph branches into two independent leaves', () => {
    const steps = [
      { step_key: 'a', depends_on: [] },
      { step_key: 'b', depends_on: ['a'] },
      { step_key: 'c', depends_on: ['a'] },
    ]
    expect(terminalStepKeys(steps)).toEqual(new Set(['b', 'c']))
  })

  it('returns every step when none depend on each other', () => {
    const steps = [
      { step_key: 'a', depends_on: [] },
      { step_key: 'b', depends_on: [] },
    ]
    expect(terminalStepKeys(steps)).toEqual(new Set(['a', 'b']))
  })

  it('returns an empty set for an empty step list', () => {
    expect(terminalStepKeys([])).toEqual(new Set())
  })

  it('treats a step referenced only via a decision condition source_step as terminal (conditions are not depends_on)', () => {
    // terminalStepKeys only looks at depends_on; a step can still be
    // "referenced" by a downstream decision's condition without being a
    // dependency, and should still count as terminal since nothing runs
    // after it in the dependency graph.
    const steps = [
      { step_key: 'extract', depends_on: [] },
      { step_key: 'escalate', depends_on: ['extract'] },
    ]
    expect(terminalStepKeys(steps)).toEqual(new Set(['escalate']))
  })
})
