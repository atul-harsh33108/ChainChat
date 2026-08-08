// Feature: run-inputs-and-variables, Property 16: The submitted input_payload is exactly the collected Run_Input values
//
// For any set of Run_Input values collected in the Run_Dialog, the
// input_payload of the resulting Execution_Request SHALL contain a value
// for every declared Run_Input_Key equal to the collected value, represented
// as a number for number fields and a string otherwise, and SHALL contain
// no additional keys.
//
// **Validates: Requirements 8.1, 8.2**
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { RunInputDef, RunInputFieldType } from '@/types'
import { buildInputPayload, isBlank } from '../run-inputs'

/**
 * Generates a single valid RunInputDef given a unique key. Mirrors the
 * arbitrary style used in run-inputs.property-2.test.ts so every generated
 * def is independently well-formed (select options count/uniqueness,
 * defaultValue conformance to fieldType).
 */
function runInputDefArbitrary(key: string): fc.Arbitrary<RunInputDef> {
  const base = {
    key: fc.constant(key),
    label: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
    required: fc.boolean(),
    helpText: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
    placeholder: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  }

  const textLike = (fieldType: RunInputFieldType) =>
    fc.record({
      ...base,
      fieldType: fc.constant(fieldType),
      defaultValue: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
      options: fc.constant(undefined),
    })

  const numberField = fc.record({
    ...base,
    fieldType: fc.constant<RunInputFieldType>('number'),
    defaultValue: fc.option(fc.integer({ min: -1000, max: 1000 }), { nil: undefined }),
    options: fc.constant(undefined),
  })

  const selectField = fc
    .uniqueArray(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0), {
      minLength: 1,
      maxLength: 10,
    })
    .chain((options) =>
      fc.record({
        ...base,
        fieldType: fc.constant<RunInputFieldType>('select'),
        options: fc.constant(options),
        defaultValue: fc.option(fc.constantFrom(...options), { nil: undefined }),
      })
    )

  return fc.oneof(textLike('text'), textLike('textarea'), numberField, selectField)
}

/**
 * Object.prototype property names are excluded from generated keys: since
 * `formValues` is a plain object literal, a key like "toString" with no own
 * property (the "absent" scenario below) resolves through the prototype
 * chain to the inherited function rather than `undefined`. That's a JS
 * object-literal hazard orthogonal to this property (Run_Input value
 * type-coercion/blank-handling), not something design.md's Property 16
 * concerns itself with.
 */
const RESERVED_KEY_NAMES = new Set([
  'constructor',
  'toString',
  'toLocaleString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
])

/** An array of 0-50 valid RunInputDefs, all with pairwise-distinct keys. */
const runInputDefsArbitrary: fc.Arbitrary<RunInputDef[]> = fc
  .uniqueArray(
    fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !RESERVED_KEY_NAMES.has(s)),
    { minLength: 0, maxLength: 50 }
  )
  .chain((keys) => fc.tuple(...keys.map(runInputDefArbitrary)))

/** A non-blank string usable as a "present" form value. */
const presentValueArbitrary = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0)

/** A blank/whitespace-only string usable as a "blank" form value. */
const blankValueArbitrary = fc.constantFrom('', ' ', '\t', '\n', '   \t\n ')

/**
 * Per-key scenario for building `formValues`:
 * - 'present': the key has a non-blank submitted value.
 * - 'blank': the key has a blank/whitespace-only submitted value (exercises
 *   both "blank with a default" and "blank with no default", depending on
 *   whether the generated def happens to carry a defaultValue).
 * - 'absent': the key is missing from `formValues` entirely.
 */
type ValueScenario = 'present' | 'blank' | 'absent'
const scenarioArbitrary: fc.Arbitrary<ValueScenario> = fc.constantFrom(
  'present',
  'blank',
  'absent'
)

/** Builds a `formValues` map for `defs`, one independently-chosen scenario per key. */
function formValuesArbitrary(defs: RunInputDef[]): fc.Arbitrary<Record<string, string>> {
  return fc
    .tuple(...defs.map(() => fc.tuple(scenarioArbitrary, presentValueArbitrary, blankValueArbitrary)))
    .map((perKey) => {
      const formValues: Record<string, string> = {}
      defs.forEach((def, i) => {
        const [scenario, presentValue, blankValue] = perKey[i]
        if (scenario === 'present') {
          formValues[def.key] = presentValue
        } else if (scenario === 'blank') {
          formValues[def.key] = blankValue
        }
        // 'absent': leave the key out of formValues entirely.
      })
      return formValues
    })
}

/** `defs` + a `formValues` map covering present/blank/absent per key. */
const scenarioInputArbitrary: fc.Arbitrary<[RunInputDef[], Record<string, string>]> =
  runInputDefsArbitrary.chain((defs) =>
    fc.tuple(fc.constant(defs), formValuesArbitrary(defs))
  )

/**
 * Independent re-derivation of the expected payload value for one def, per
 * design.md's rule: number-typed via Number(...) for fieldType 'number',
 * string otherwise, using '' for a blank field with no default, falling
 * back to defaultValue when blank and a default exists.
 */
function expectedPayloadValue(def: RunInputDef, formValues: Record<string, string>): unknown {
  const raw = formValues[def.key]
  const blank = isBlank(raw)

  if (blank && def.defaultValue === undefined) {
    return ''
  }

  const effective = blank ? def.defaultValue : raw
  return def.fieldType === 'number' ? Number(effective) : String(effective)
}

describe('Property 16: The submitted input_payload is exactly the collected Run_Input values', () => {
  it('contains exactly one entry per declared Run_Input, matching the expected value, and no additional keys', () => {
    fc.assert(
      fc.property(scenarioInputArbitrary, ([defs, formValues]) => {
        const payload = buildInputPayload(defs, formValues)

        // No additional keys: the key set is exactly the declared Run_Input_Keys.
        const declaredKeys = defs.map((def) => def.key)
        expect(new Set(Object.keys(payload))).toEqual(new Set(declaredKeys))
        expect(Object.keys(payload)).toHaveLength(declaredKeys.length)

        // Each declared Run_Input's value matches the expected value.
        for (const def of defs) {
          const expected = expectedPayloadValue(def, formValues)
          if (typeof expected === 'number' && Number.isNaN(expected)) {
            expect(Number.isNaN(payload[def.key] as number)).toBe(true)
          } else {
            expect(payload[def.key]).toEqual(expected)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
