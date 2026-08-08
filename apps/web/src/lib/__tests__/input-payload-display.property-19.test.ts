// Feature: run-inputs-and-variables, Property 19: The "no inputs" predicate matches null, undefined, and empty-object payloads exactly
//
// For any `input_payload`, the Workflow_Runs_Page's no-inputs predicate
// SHALL return `true` if and only if the payload is `null`, `undefined`, or
// an object with zero own enumerable keys.
//
// **Validates: Requirements 9.2, 10.3**
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { hasNoInputs } from '../input-payload-display'

/**
 * Independently-derived oracle for Property 19, re-stated directly from
 * design.md's property text rather than delegating to `hasNoInputs`'s
 * internals: `true` iff the payload is `null`, `undefined`, or an object
 * with zero own enumerable keys.
 */
function isNoInputsByOracle(payload: unknown): boolean {
  if (payload === null || payload === undefined) return true
  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return Object.keys(payload as Record<string, unknown>).length === 0
  }
  return false
}

/** Arbitrary JSON-compatible values for use as dictionary entries. */
const jsonValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)), { maxLength: 5 }),
  fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)), {
    maxKeys: 5,
  })
)

// (a) The two fixed non-object values that count as "no inputs".
const fixedNoInputsArb = fc.constantFrom<null | undefined>(null, undefined)

// (b) Arbitrary empty objects -- always `{}` structurally, but generated
// via fast-check rather than hard-coded so the property holds for any way
// of arriving at an empty object.
const emptyObjectArb: fc.Arbitrary<Record<string, unknown>> = fc.constant({})

// (c) Arbitrary non-empty objects: at least 1 key, arbitrary string keys,
// arbitrary JSON-compatible values.
const nonEmptyObjectArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(fc.string(), jsonValueArb, {
  minKeys: 1,
})

describe('hasNoInputs (Property 19: matches null, undefined, and empty-object payloads exactly)', () => {
  it('returns true for null and undefined', () => {
    fc.assert(
      fc.property(fixedNoInputsArb, (payload) => {
        expect(hasNoInputs(payload)).toBe(isNoInputsByOracle(payload))
        expect(hasNoInputs(payload)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('returns true for arbitrary empty objects', () => {
    fc.assert(
      fc.property(emptyObjectArb, (payload) => {
        expect(hasNoInputs(payload)).toBe(isNoInputsByOracle(payload))
        expect(hasNoInputs(payload)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('returns false for arbitrary non-empty objects', () => {
    fc.assert(
      fc.property(nonEmptyObjectArb, (payload) => {
        expect(hasNoInputs(payload)).toBe(isNoInputsByOracle(payload))
        expect(hasNoInputs(payload)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})
