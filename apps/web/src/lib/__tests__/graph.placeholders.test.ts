// Fixture-table-driven unit tests for extractPlaceholders.
//
// These are plain example-based tests (not fast-check) that consume the
// shared fixture table at `fixtures/placeholder-extraction-cases.json`
// (repo root), which is the single source of truth for the "maximal,
// non-nested, non-doubled placeholder" rule shared between this
// client-side extractor and the backend's `extract_placeholder_names`
// (see `services/execution-service/tests/test_rendering_fixtures.py`).
// Keeping both suites reading the same file is what the design doc's
// Testing Strategy "Consistency check" refers to.
//
// Requirements: Requirement 6 (Criterion 6); Design > Testing Strategy
// "Consistency check".
import { readFileSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { extractPlaceholders } from '../graph'

interface PlaceholderCase {
  name: string
  template: string
  variables: Record<string, unknown>
  expectedRendered: string
  expectedNames: string[]
}

// __tests__ -> lib -> src -> web -> apps -> repo root
const FIXTURES_PATH = path.resolve(
  __dirname,
  '../../../../../fixtures/placeholder-extraction-cases.json'
)

function loadCases(): PlaceholderCase[] {
  const raw = readFileSync(FIXTURES_PATH, 'utf-8')
  const cases = JSON.parse(raw) as PlaceholderCase[]
  if (!cases.length) {
    throw new Error('fixture file loaded but contains no cases')
  }
  return cases
}

const cases = loadCases()

describe('extractPlaceholders matches the shared fixture table', () => {
  it.each(cases.map((c) => [c.name, c] as const))(
    'case %s',
    (_name, testCase) => {
      const names = extractPlaceholders(testCase.template)
      // Order isn't guaranteed to matter for extracted placeholder names
      // (the backend's equivalent test compares as a Python `set`), so
      // compare as sets here too rather than asserting array order.
      expect(new Set(names)).toEqual(new Set(testCase.expectedNames))
    }
  )
})
