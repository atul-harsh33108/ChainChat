import * as React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VariablePicker } from '../variable-picker'

/**
 * Feature: run-inputs-and-variables, Property 15: Inserting a variable
 * reference adds exactly one placeholder and preserves surrounding text
 * (exercised as RTL examples per design.md's Testing Strategy, since this
 * is UI behavior, not a pure function suitable for fast-check).
 *
 * Test harness: a real <textarea> ref'd alongside the VariablePicker, so
 * selectionStart/selectionEnd state can be set up with setSelectionRange
 * before opening the picker, mirroring how the Prompt node inspector wires
 * VariablePicker to its prompt Textarea in workflow-builder.tsx.
 */
function Harness({
  entries,
  initialValue,
  selection,
  attachRef = true,
}: {
  entries: string[]
  initialValue: string
  /** [start, end] to apply via setSelectionRange before opening the picker. */
  selection?: [number, number]
  /**
   * Whether the rendered textarea's DOM node is wired up to `targetRef`.
   * Setting this to false leaves `targetRef.current` as `null`, which is
   * exactly how `variable-picker.tsx` recognises "no established cursor
   * position or text selection" (it falls back to `value.length` only when
   * the ref itself is unset) -- jsdom, like real browsers, always reports a
   * concrete `selectionStart`/`selectionEnd` (defaulting to 0) on a
   * rendered-but-unfocused textarea, so that case alone can't reach the
   * "never established" branch under test.
   */
  attachRef?: boolean
}) {
  const targetRef = React.useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = React.useState(initialValue)

  React.useEffect(() => {
    if (selection && targetRef.current) {
      targetRef.current.setSelectionRange(selection[0], selection[1])
    }
    // Only run once on mount to establish the initial selection/cursor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <textarea
        data-testid="prompt-textarea"
        ref={attachRef ? targetRef : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <VariablePicker entries={entries} targetRef={targetRef} value={value} onChange={setValue} />
    </div>
  )
}

async function openPickerAndSelect(entry: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /insert variable/i }))
  const menu = await screen.findByRole('menu')
  await user.click(within(menu).getByRole('menuitem', { name: entry }))
}

describe('VariablePicker', () => {
  it('replaces an active selection with the placeholder and leaves surrounding text unchanged', async () => {
    const initialValue = 'Hello WORLD, goodbye'
    // "WORLD" occupies indices [6, 11).
    render(<Harness entries={['name']} initialValue={initialValue} selection={[6, 11]} />)

    await openPickerAndSelect('name')

    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('Hello {name}, goodbye')
    // Exactly one occurrence of the placeholder.
    expect(textarea.value.split('{name}')).toHaveLength(2)
    // Text outside the selection is unchanged.
    expect(textarea.value.startsWith('Hello ')).toBe(true)
    expect(textarea.value.endsWith(', goodbye')).toBe(true)
  })

  it('inserts the placeholder at the cursor position when there is no active selection', async () => {
    const initialValue = 'Hello , goodbye'
    // Cursor placed right after "Hello " (index 6), no selection.
    render(<Harness entries={['name']} initialValue={initialValue} selection={[6, 6]} />)

    await openPickerAndSelect('name')

    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('Hello {name}, goodbye')
    expect(textarea.value.split('{name}')).toHaveLength(2)
    expect(textarea.value.startsWith('Hello ')).toBe(true)
    expect(textarea.value.endsWith(', goodbye')).toBe(true)
  })

  it('appends the placeholder at the end when the textarea has no established cursor position', async () => {
    const initialValue = 'Hello world'
    // `attachRef={false}`: the rendered textarea's DOM node is never wired
    // up to `targetRef`, so `targetRef.current` stays `null` -- the actual
    // "no established cursor position or text selection" case the picker's
    // `value.length` fallback exists for (Req 7.5). A rendered-but-merely-
    // unfocused textarea always reports a concrete selectionStart/End (0)
    // in both jsdom and real browsers, so it can't exercise this branch.
    render(<Harness entries={['name']} initialValue={initialValue} attachRef={false} />)

    await openPickerAndSelect('name')

    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('Hello world{name}')
    expect(textarea.value.split('{name}')).toHaveLength(2)
    expect(textarea.value.startsWith('Hello world')).toBe(true)
  })

  it('shows a disabled empty-state item when there are no entries', async () => {
    render(<Harness entries={[]} initialValue="Hello" />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /insert variable/i }))

    const menu = await screen.findByRole('menu')
    const emptyItem = within(menu).getByText('No variables available yet')
    expect(emptyItem).toBeInTheDocument()
    expect(emptyItem.closest('[role="menuitem"]')).toHaveAttribute('data-disabled')

    // The textarea is untouched since there was nothing to select.
    const textarea = screen.getByTestId('prompt-textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('Hello')
  })
})
