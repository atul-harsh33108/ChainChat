// Feature: run-inputs-and-variables, Property 1: Run_Input acceptance is a well-formedness predicate
//
// For any candidate RunInputDef and any list of sibling RunInputDefs already
// declared on the same Start_Node, the Workflow_Builder SHALL accept adding
// the candidate if and only if: its key is non-empty, at most 64 characters,
// matches ^[A-Za-z_][A-Za-z0-9_]*$, and is not already used by a sibling;
// its label is non-empty and at most 200 characters; its fieldType is one of
// text, textarea, number, select; when fieldType is select, its options has
// between 1 and 100 pairwise-distinct entries; any defaultValue conforms to
// fieldType (parses as a number for number, is one of options for select);
// and the sibling count is below 50.
//
// **Validates: Requirements 1.2, 1.3, 1.9, 1.10, 1.11, 1.12**
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { validateRunInput, RUN_INPUT_KEY_PATTERN, MAX_RUN_INPUTS } from '../run-inputs'
import type { RunInputDef, RunInputFieldType } from '@/types'

/** Shape used to generate candidates/siblings; loosened from RunInputDef so
 * we can deliberately construct malformed values (bad fieldType strings,
 * mismatched defaultValue) that TypeScript would otherwise reject. */
interface FuzzedRunInput {
  key: string
  label: string
  fieldType: string
  required: boolean
  defaultValue?: string | number
  options?: string[]
}

interface FuzzedSibling {
  key: string
}

const VALID_FIELD_TYPES: RunInputFieldType[] = ['text', 'textarea', 'number', 'select']

/**
 * Independent re-derivation of "non-empty" for the oracle. Mirrors the
 * codebase's own definition of blankness (missing/empty/all-whitespace,
 * see `isBlank` in run-inputs.ts) rather than a strict `length > 0` check.
 * design.md's Property 1 text says "non-empty" without further
 * qualification; the implementation treats a whitespace-only key or label
 * as blank via `isBlank`. For keys this never changes the outcome (the
 * pattern already disallows whitespace), but for labels it does: a
 * whitespace-only label (e.g. `' '`) is literally "non-empty" by a naive
 * string-length reading yet is rejected by the implementation. We adopt the
 * `isBlank` reading here as the more coherent interpretation of the spec
 * (consistent with how "blank" is defined elsewhere in this feature), and
 * call this out explicitly rather than silently picking whichever
 * definition happens to make the test pass.
 */
function isBlankLike(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim().length === 0
}

/**
 * Oracle: independently re-derives Property 1's well-formedness predicate
 * from design.md's spec text (see comment above), rather than delegating to
 * `validateRunInput`'s internals.
 */
function isWellFormedByOracle(candidate: FuzzedRunInput, siblings: FuzzedSibling[]): boolean {
  // Key: non-empty, <= 64 chars, matches the placeholder-name pattern, and
  // not already used by a sibling.
  const key = candidate.key
  if (isBlankLike(key)) return false
  if (key.length > 64) return false
  if (!RUN_INPUT_KEY_PATTERN.test(key)) return false
  if (siblings.some((sibling) => sibling.key === key)) return false

  // Label: non-empty, <= 200 chars.
  const label = candidate.label
  if (isBlankLike(label)) return false
  if (label.length > 200) return false

  // fieldType: one of the four recognised kinds.
  if (!VALID_FIELD_TYPES.includes(candidate.fieldType as RunInputFieldType)) return false

  // select: 1-100 pairwise-distinct options; defaultValue (if any) must be
  // one of them.
  if (candidate.fieldType === 'select') {
    const options = candidate.options ?? []
    if (options.length < 1 || options.length > 100) return false
    if (new Set(options).size !== options.length) return false
    if (candidate.defaultValue !== undefined && !options.includes(String(candidate.defaultValue))) {
      return false
    }
  } else if (candidate.fieldType === 'number' && candidate.defaultValue !== undefined) {
    // number: defaultValue (if any) must parse as a number.
    const asString = String(candidate.defaultValue)
    if (isBlankLike(asString) || Number.isNaN(Number(candidate.defaultValue))) return false
  }

  // Sibling ceiling.
  if (siblings.length >= MAX_RUN_INPUTS) return false

  return true
}

// --- Arbitraries -----------------------------------------------------------

const validKeyArb = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,20}$/)
const overlongValidKeyArb = fc.integer({ min: 65, max: 90 }).map((n) => 'k'.repeat(n))
const malformedKeyArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('1abc'),
  fc.constant('abc-def'),
  fc.constant('abc def'),
  fc.constant('café'),
  fc.constant('变量'),
  fc.string({ minLength: 1, maxLength: 10 })
)
const keyArb = fc.oneof(
  { weight: 3, arbitrary: validKeyArb },
  { weight: 1, arbitrary: overlongValidKeyArb },
  { weight: 3, arbitrary: malformedKeyArb }
)

const validLabelArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
const overlongLabelArb = fc.integer({ min: 201, max: 220 }).map((n) => 'L'.repeat(n))
const blankLabelArb = fc.constantFrom('', '   ', '\t\n')
const labelArb = fc.oneof(
  { weight: 4, arbitrary: validLabelArb },
  { weight: 1, arbitrary: overlongLabelArb },
  { weight: 2, arbitrary: blankLabelArb }
)

const fieldTypeArb = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom<string>(...VALID_FIELD_TYPES) },
  { weight: 1, arbitrary: fc.constantFrom('boolean', 'date', 'TEXT', '') }
)

const optionsArb = fc.oneof(
  { weight: 2, arbitrary: fc.constant(undefined) },
  {
    weight: 2,
    arbitrary: fc.array(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 20 }),
  },
  {
    weight: 2,
    arbitrary: fc.array(fc.constantFrom('opt-a', 'opt-b', 'opt-c'), { minLength: 2, maxLength: 15 }),
  },
  { weight: 1, arbitrary: fc.constant([]) },
  {
    weight: 1,
    arbitrary: fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 101, maxLength: 110 }),
  }
)

const defaultValueArb = fc.oneof(
  { weight: 2, arbitrary: fc.constant(undefined) },
  { weight: 2, arbitrary: fc.string({ minLength: 0, maxLength: 10 }) },
  { weight: 2, arbitrary: fc.integer({ min: -1000, max: 1000 }) },
  { weight: 1, arbitrary: fc.double({ noNaN: true, min: -100, max: 100 }) }
)

const candidateArb: fc.Arbitrary<FuzzedRunInput> = fc.record({
  key: keyArb,
  label: labelArb,
  fieldType: fieldTypeArb,
  required: fc.boolean(),
  defaultValue: defaultValueArb,
  options: optionsArb,
})

const siblingKeyArb = fc.oneof(
  { weight: 3, arbitrary: validKeyArb },
  { weight: 1, arbitrary: malformedKeyArb }
)
const siblingsArb = fc
  .array(siblingKeyArb, { minLength: 0, maxLength: 55 })
  .map((keys) => keys.map((key) => ({ key })))

// --- Property ---------------------------------------------------------------

describe('validateRunInput (Property 1: acceptance is a well-formedness predicate)', () => {
  it('accepts a candidate Run_Input if and only if the well-formedness oracle says so', () => {
    fc.assert(
      fc.property(candidateArb, siblingsArb, fc.boolean(), (candidate, siblingsBase, forceCollision) => {
        const siblings: FuzzedSibling[] =
          forceCollision && candidate.key.length > 0
            ? [...siblingsBase, { key: candidate.key }]
            : siblingsBase

        const expected = isWellFormedByOracle(candidate, siblings)

        const siblingDefs = siblings.map(
          (sibling): RunInputDef => ({
            key: sibling.key,
            label: 'Sibling',
            fieldType: 'text',
            required: false,
          })
        )

        const actual =
          validateRunInput(candidate as unknown as RunInputDef, siblingDefs).length === 0

        expect(actual).toBe(expected)
      }),
      { numRuns: 100 }
    )
  })
})
