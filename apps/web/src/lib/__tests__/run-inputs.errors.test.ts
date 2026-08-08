import { describe, it, expect } from 'vitest'
import type { RunInputDef } from '@/types'
import { MAX_RUN_INPUTS, validateRunInput } from '../run-inputs'

/** A minimally valid Run_Input, overridden per test case. */
function baseRunInput(overrides: Partial<RunInputDef> = {}): RunInputDef {
  return {
    key: 'my_key',
    label: 'My Label',
    fieldType: 'text',
    required: false,
    ...overrides,
  }
}

describe('validateRunInput error messages', () => {
  it('reports the key pattern violation for a key starting with a digit or containing a space/hyphen', () => {
    const digitStart = validateRunInput(baseRunInput({ key: '1abc' }), [])
    expect(digitStart).toContain('Key must match ^[A-Za-z_][A-Za-z0-9_]*$.')

    const withHyphen = validateRunInput(baseRunInput({ key: 'my-key' }), [])
    expect(withHyphen).toContain('Key must match ^[A-Za-z_][A-Za-z0-9_]*$.')
  })

  it('reports the key length violation for a key over 64 characters', () => {
    const longKey = 'a'.repeat(65)
    const reasons = validateRunInput(baseRunInput({ key: longKey }), [])
    expect(reasons).toContain('Key must be at most 64 characters.')
  })

  it('reports the duplicate key violation when a sibling already uses the key', () => {
    const siblings: RunInputDef[] = [baseRunInput({ key: 'dup_key' })]
    const reasons = validateRunInput(baseRunInput({ key: 'dup_key' }), siblings)
    expect(reasons).toContain('Key "dup_key" is already used by another Run Input.')
  })

  it('reports the empty label violation', () => {
    const reasons = validateRunInput(baseRunInput({ label: '' }), [])
    expect(reasons).toContain('Label is required.')
  })

  it('reports the option-count violation for a select field with 0 options', () => {
    const reasons = validateRunInput(
      baseRunInput({ fieldType: 'select', options: [] }),
      []
    )
    expect(reasons).toContain('A select field must define between 1 and 100 options.')
  })

  it('reports the default-value violation for a select field whose default is not one of its options', () => {
    const reasons = validateRunInput(
      baseRunInput({ fieldType: 'select', options: ['a', 'b'], defaultValue: 'c' }),
      []
    )
    expect(reasons).toContain('Default value must be one of the defined options.')
  })

  it('reports the default-value violation for a number field with a non-numeric default', () => {
    const reasons = validateRunInput(
      baseRunInput({ fieldType: 'number', defaultValue: 'abc' }),
      []
    )
    expect(reasons).toContain('Default value must be numeric for a number field.')
  })

  it('reports the maximum-Run_Inputs violation for a 51st Run_Input', () => {
    const siblings: RunInputDef[] = Array.from({ length: MAX_RUN_INPUTS }, (_, i) =>
      baseRunInput({ key: `key_${i}` })
    )
    const reasons = validateRunInput(baseRunInput({ key: 'one_too_many' }), siblings)
    expect(reasons).toContain(`Cannot add more than ${MAX_RUN_INPUTS} Run Inputs.`)
  })
})
