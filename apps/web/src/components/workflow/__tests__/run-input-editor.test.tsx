import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RunInputEditor } from '../run-input-editor'
import { MAX_RUN_INPUTS } from '@/lib/run-inputs'
import type { RunInputDef } from '@/types'

function makeValidRunInputs(count: number): RunInputDef[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `key${i}`,
    label: `Label ${i}`,
    fieldType: 'text' as const,
    required: false,
  }))
}

describe('RunInputEditor', () => {
  it('adds a new (draft) row without committing it until valid', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RunInputEditor runInputs={[]} onChange={onChange} />)

    expect(screen.queryByLabelText('Key')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Run Input' }))

    // The new row is rendered as a draft even though it's not yet valid.
    expect(screen.getByLabelText('Key')).toBeInTheDocument()
    expect(screen.getByLabelText('Label')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits an edited row to onChange only once it becomes valid', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RunInputEditor runInputs={[]} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Add Run Input' }))

    const keyInput = screen.getByLabelText('Key')
    const labelInput = screen.getByLabelText('Label')

    // Filling in just the key still leaves the row invalid (label is blank).
    await user.type(keyInput, 'myKey')
    expect(onChange).not.toHaveBeenCalled()

    // Filling in the label too makes the row valid, committing it.
    await user.type(labelInput, 'My Label')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
    expect(lastCall).toEqual([
      { key: 'myKey', label: 'My Label', fieldType: 'text', required: false },
    ])
  })

  it('reorders committed rows with Move up / Move down', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const initial = makeValidRunInputs(2) // key0/Label 0, key1/Label 1
    render(<RunInputEditor runInputs={initial} onChange={onChange} />)

    const moveDownButtons = screen.getAllByRole('button', { name: 'Move down' })
    await user.click(moveDownButtons[0])

    expect(onChange).toHaveBeenLastCalledWith([initial[1], initial[0]])

    const moveUpButtons = screen.getAllByRole('button', { name: 'Move up' })
    // After the swap above, the row now at index 0 is initial[1]; moving the
    // second row (initial[0], now at index 1) up restores the original order.
    await user.click(moveUpButtons[1])

    expect(onChange).toHaveBeenLastCalledWith([initial[0], initial[1]])
  })

  it('removes a row and commits the excluding list to onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const initial = makeValidRunInputs(2)
    render(<RunInputEditor runInputs={initial} onChange={onChange} />)

    const removeButtons = screen.getAllByRole('button', { name: 'Remove run input' })
    await user.click(removeButtons[0])

    expect(onChange).toHaveBeenLastCalledWith([initial[1]])
  })

  it('disables "Add Run Input" once MAX_RUN_INPUTS rows are present', () => {
    const onChange = vi.fn()
    const initial = makeValidRunInputs(MAX_RUN_INPUTS)
    render(<RunInputEditor runInputs={initial} onChange={onChange} />)

    expect(screen.getByRole('button', { name: 'Add Run Input' })).toBeDisabled()
  })

  it('shows an inline error for an invalid key and does not commit the invalid draft', () => {
    const onChange = vi.fn()
    const initial: RunInputDef[] = [
      { key: 'alpha', label: 'Alpha', fieldType: 'text', required: false },
    ]
    render(<RunInputEditor runInputs={initial} onChange={onChange} />)

    const keyInput = screen.getByLabelText('Key')
    fireEvent.change(keyInput, { target: { value: 'alpha-' } })

    expect(screen.getByText('Key must match ^[A-Za-z_][A-Za-z0-9_]*$.')).toBeInTheDocument()
    // The invalid draft is never propagated to the parent.
    expect(onChange).not.toHaveBeenCalled()
  })
})
