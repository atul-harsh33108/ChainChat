// Feature: run-inputs-and-variables, Property 18: The Runs Page's value classifier matches JSON's own structure
//
// For any JSON-compatible value, the Workflow_Runs_Page's value-kind
// classifier SHALL report 'array' if and only if the value is an array,
// 'object' if and only if the value is a non-array, non-null object, and
// 'scalar' otherwise.
//
// **Validates: Requirements 9.1**
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { classifyInputValue } from '../input-payload-display'

/**
 * Independent oracle re-derived directly from design.md's Property 18 text,
 * rather than delegating to classifyInputValue's own implementation.
 */
function classifyByOracle(value: unknown): 'scalar' | 'array' | 'object' {
  if (Array.isArray(value)) return 'array'
  if (value !== null && typeof value === 'object') return 'object'
  return 'scalar'
}

describe("Property 18: the Runs Page's value classifier matches JSON's own structure", () => {
  it('classifies any JSON-compatible value the same way as the independent oracle', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(classifyInputValue(value)).toBe(classifyByOracle(value))
      }),
      { numRuns: 100 }
    )
  })

  it('classifies undefined as scalar', () => {
    // fc.jsonValue() never produces `undefined` (it isn't a JSON type), but
    // classifyInputValue must still handle it per its `unknown` signature
    // (e.g. a missing key read via `payload[key]`).
    expect(classifyInputValue(undefined)).toBe('scalar')
  })
})
