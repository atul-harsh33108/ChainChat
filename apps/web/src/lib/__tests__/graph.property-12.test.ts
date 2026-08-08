// Feature: run-inputs-and-variables, Property 12: A Prompt_Node's derived Step_Reference_Key is stable and matches toStepKey
//
// For any Prompt_Node lacking a custom Step_Reference_Key, the
// Graph_Compiler's derived key SHALL equal toStepKey(node.id), and compiling
// the same, unmodified graph twice SHALL produce that same key both times.
//
// **Validates: Requirements 6.2, 6.7**
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { GraphNode } from '@/types'
import { stepReferenceKey, toStepKey } from '../graph'

/**
 * A Prompt_Node with no custom Step_Reference_Key. `stepKey` is either
 * absent, `undefined`, an empty string, or a whitespace-only string -- all
 * of which count as "no custom Step_Reference_Key" per stepReferenceKey's
 * `.trim()`-based emptiness check.
 */
const promptNodeWithoutCustomKeyArbitrary: fc.Arbitrary<GraphNode> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 40 }),
    fc.oneof(
      fc.constant(undefined),
      fc.constant(''),
      fc
        .array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 5 })
        .map((chars) => chars.join(''))
    ),
    fc.boolean() // whether to omit `stepKey` from config entirely
  )
  .map(([id, whitespaceLikeStepKey, omitStepKey]) => {
    const config = omitStepKey ? {} : { stepKey: whitespaceLikeStepKey }
    return {
      id,
      type: 'prompt' as const,
      position: { x: 0, y: 0 },
      config,
    }
  })

describe("Property 12: a Prompt_Node's derived Step_Reference_Key is stable and matches toStepKey", () => {
  it('equals toStepKey(node.id) when no custom Step_Reference_Key is set (model-based)', () => {
    fc.assert(
      fc.property(promptNodeWithoutCustomKeyArbitrary, (node) => {
        expect(stepReferenceKey(node)).toBe(toStepKey(node.id))
      }),
      { numRuns: 100 }
    )
  })

  it('returns the same value on repeated calls against the same unmodified node (stability)', () => {
    fc.assert(
      fc.property(promptNodeWithoutCustomKeyArbitrary, (node) => {
        const first = stepReferenceKey(node)
        const second = stepReferenceKey(node)
        expect(second).toBe(first)
      }),
      { numRuns: 100 }
    )
  })
})
