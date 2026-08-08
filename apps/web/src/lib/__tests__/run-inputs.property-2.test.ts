// Feature: run-inputs-and-variables, Property 2: Run_Input declarations round-trip through storage
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { RunInputDef, RunInputFieldType, NodeConfig, WorkflowGraph } from '@/types'
import { getRunInputs, validateRunInput } from '../run-inputs'

/**
 * Generates a single valid RunInputDef given a unique key. Fields are kept
 * internally consistent with `validateRunInput`'s rules (select options
 * count/uniqueness, defaultValue conformance to fieldType) so every
 * generated def is guaranteed valid on its own; uniqueness across the whole
 * array is enforced separately by the array-level generator below.
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

/** An array of 0-50 valid RunInputDefs, all with pairwise-distinct keys. */
const runInputDefsArbitrary: fc.Arbitrary<RunInputDef[]> = fc
  .uniqueArray(
    fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)),
    { minLength: 0, maxLength: 50 }
  )
  .chain((keys) => fc.tuple(...keys.map(runInputDefArbitrary)))

function buildGraph(runInputs: RunInputDef[]): WorkflowGraph {
  const config: NodeConfig = { runInputs }
  return {
    nodes: [
      {
        id: 'start-1',
        type: 'start',
        position: { x: 0, y: 0 },
        config,
      },
    ],
    edges: [],
  }
}

describe('Property 2: Run_Input declarations round-trip through storage', () => {
  it('preserves order, keys, labels, types, defaults, help text, placeholders, and required flags through JSON storage', () => {
    fc.assert(
      fc.property(runInputDefsArbitrary, (runInputs) => {
        // Sanity check: every generated def is independently well-formed
        // per validateRunInput, given its already-declared siblings.
        for (let i = 0; i < runInputs.length; i++) {
          const reasons = validateRunInput(runInputs[i], runInputs.slice(0, i))
          expect(reasons).toEqual([])
        }

        // "Storage" is JSONB: NodeConfig.runInputs is persisted and reloaded
        // as JSON. Wrap in a WorkflowGraph-shaped Start_Node so the
        // round-trip is exercised through the actual NodeConfig.runInputs
        // field shape and read back via getRunInputs(), not just a bare
        // JSON.stringify/parse on the array in isolation.
        const graph = buildGraph(runInputs)
        const serialized = JSON.stringify(graph)
        const reloaded: WorkflowGraph = JSON.parse(serialized)

        const roundTripped = getRunInputs(reloaded)

        expect(roundTripped).toEqual(runInputs)
      }),
      { numRuns: 100 }
    )
  })
})
