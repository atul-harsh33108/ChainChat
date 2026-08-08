import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RunDialog } from '../run-dialog'
import type { RunInputDef } from '@/types'

// Radix's Select primitive relies on pointer-capture APIs jsdom does not
// implement; without these shims, opening the Select in a test environment
// throws (`target.hasPointerCapture is not a function`).
beforeAll(() => {
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = () => false
  }
  if (!window.HTMLElement.prototype.releasePointerCapture) {
    window.HTMLElement.prototype.releasePointerCapture = () => {}
  }
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {}
  }
})

const RUN_INPUTS: RunInputDef[] = [
  {
    key: 'name',
    label: 'Name',
    fieldType: 'text',
    required: true,
    placeholder: 'Enter a name',
  },
  {
    key: 'description',
    label: 'Description',
    fieldType: 'textarea',
    required: false,
    defaultValue: 'Default description text',
  },
  {
    key: 'count',
    label: 'Count',
    fieldType: 'number',
    required: false,
    defaultValue: 42,
  },
  {
    key: 'mode',
    label: 'Mode',
    fieldType: 'select',
    required: false,
    options: ['fast', 'slow'],
    defaultValue: 'fast',
  },
]

function renderDialog(
  runInputs: RunInputDef[] = RUN_INPUTS,
  overrides: Partial<{ onCancel: () => void; onConfirm: (payload: Record<string, unknown>) => void }> = {}
) {
  const onCancel = overrides.onCancel ?? vi.fn()
  const onConfirm = overrides.onConfirm ?? vi.fn()
  const result = render(<RunDialog runInputs={runInputs} onCancel={onCancel} onConfirm={onConfirm} />)
  return { ...result, onCancel, onConfirm }
}

describe('RunDialog', () => {
  it('renders one field per declared Run_Input, in declaration order, with matching labels', () => {
    renderDialog()

    // Dialog content renders into a Radix portal appended to document.body,
    // outside the render() container, so query from there.
    const labels = Array.from(document.body.querySelectorAll('label')).map((el) => el.textContent)
    expect(labels).toEqual(RUN_INPUTS.map((def) => def.label))
  })

  it('pre-fills fields with their declared default values', () => {
    renderDialog()

    expect(screen.getByLabelText('Description')).toHaveValue('Default description text')
    expect(screen.getByLabelText('Count')).toHaveValue(42)
    // The select's default value is rendered as its visible selected text.
    expect(screen.getByLabelText('Mode')).toHaveTextContent('fast')
    // No default declared for the required text field.
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('restricts a select field to its declared options', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByLabelText('Mode'))

    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options.map((o) => o.textContent)).toEqual(['fast', 'slow'])
  })

  it('blocks confirmation when a required field is blank, without calling onConfirm', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()

    await user.type(screen.getByLabelText('Description'), ' extra text')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows an invalid indicator on the blank required field when confirmation is blocked', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(screen.getByText('This field is required.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveClass('border-destructive')
  })

  it('preserves other fields\' values when confirmation is blocked', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'kept value')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(screen.getByLabelText('Description')).toHaveValue('kept value')
    expect(screen.getByLabelText('Count')).toHaveValue(42)
  })

  it('clears the invalid indicator once the blocked required field receives a non-whitespace value', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Run' }))
    expect(screen.getByText('This field is required.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Name'), 'Ada')

    expect(screen.queryByText('This field is required.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Name')).not.toHaveClass('border-destructive')
  })

  it('calls onConfirm with the collected input payload once required fields are filled', async () => {
    const user = userEvent.setup()
    const { onConfirm } = renderDialog()

    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.click(screen.getByRole('button', { name: 'Run' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({
      name: 'Ada',
      description: 'Default description text',
      count: 42,
      mode: 'fast',
    })
  })

  it('calls onCancel and never onConfirm when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const { onCancel, onConfirm } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onCancel and never onConfirm when Escape is pressed', async () => {
    const user = userEvent.setup()
    const { onCancel, onConfirm } = renderDialog()

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onCancel and never onConfirm when the dialog\'s close button is clicked', async () => {
    const user = userEvent.setup()
    const { onCancel, onConfirm } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
