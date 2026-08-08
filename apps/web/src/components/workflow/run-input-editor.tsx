import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MAX_RUN_INPUTS, validateRunInput } from '@/lib/run-inputs'
import type { RunInputDef, RunInputFieldType } from '@/types'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

interface RunInputEditorProps {
  /** Declared Run_Inputs, in author-defined order (Req 1.1). */
  runInputs: RunInputDef[]
  /** Called with the next committed list whenever a valid edit occurs. */
  onChange: (next: RunInputDef[]) => void
}

const FIELD_TYPES: { value: RunInputFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text area' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
]

const EMPTY_DRAFT: RunInputDef = { key: '', label: '', fieldType: 'text', required: false }

/**
 * One row of local, possibly-invalid editing state. `committed` mirrors what
 * has last been sent to the parent via `onChange` for this row (`null` for a
 * freshly added row that has never been valid yet); `draft` is always what's
 * currently rendered, so an invalid in-progress edit is never discarded or
 * silently written to the parent's `runInputs` (Req 1.8-1.12).
 */
interface RowState {
  id: string
  committed: RunInputDef | null
  draft: RunInputDef
  errors: string[]
}

function committedSiblings(rows: RowState[], excludeId: string | null): RunInputDef[] {
  return rows
    .filter((r) => r.id !== excludeId)
    .map((r) => r.committed)
    .filter((d): d is RunInputDef => d !== null)
}

interface ErrorBuckets {
  key: string[]
  label: string[]
  fieldType: string[]
  defaultValue: string[]
  options: string[]
  other: string[]
}

/** Groups flat validation messages so they render under the relevant field. */
function classifyErrors(errors: string[]): ErrorBuckets {
  const buckets: ErrorBuckets = {
    key: [],
    label: [],
    fieldType: [],
    defaultValue: [],
    options: [],
    other: [],
  }
  for (const e of errors) {
    if (/^key/i.test(e)) buckets.key.push(e)
    else if (/^label/i.test(e)) buckets.label.push(e)
    else if (/^field type/i.test(e)) buckets.fieldType.push(e)
    else if (/^default value/i.test(e)) buckets.defaultValue.push(e)
    else if (/option/i.test(e)) buckets.options.push(e)
    else buckets.other.push(e)
  }
  return buckets
}

function FieldErrors({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null
  return (
    <div className="space-y-0.5">
      {messages.map((msg) => (
        <p key={msg} className="text-xs text-destructive">
          {msg}
        </p>
      ))}
    </div>
  )
}

/**
 * Row-based editor over a Start_Node's declared Run_Inputs. Supports adding
 * (disabled at `MAX_RUN_INPUTS`), editing every field, reordering (up/down),
 * and removing rows. Each row validates itself against its siblings on every
 * change and only propagates a change to the parent once it is valid.
 */
export function RunInputEditor({ runInputs, onChange }: RunInputEditorProps) {
  const idCounterRef = useRef(0)
  const makeId = () => {
    idCounterRef.current += 1
    return `run-input-row-${idCounterRef.current}`
  }

  const [rows, setRows] = useState<RowState[]>(() =>
    runInputs.map((def) => ({ id: makeId(), committed: def, draft: def, errors: [] }))
  )

  const emitCommitted = (next: RowState[]) => {
    onChange(committedSiblings(next, null))
  }

  const addRow = () => {
    if (rows.length >= MAX_RUN_INPUTS) return
    const errors = validateRunInput(EMPTY_DRAFT, committedSiblings(rows, null))
    setRows((prev) => [...prev, { id: makeId(), committed: null, draft: EMPTY_DRAFT, errors }])
  }

  const removeRow = (id: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id)
      emitCommitted(next)
      return next
    })
  }

  const moveRow = (id: string, direction: -1 | 1) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id)
      const swapIdx = idx + direction
      if (idx === -1 || swapIdx < 0 || swapIdx >= prev.length) return prev
      const next = [...prev]
      const tmp = next[idx]
      next[idx] = next[swapIdx]
      next[swapIdx] = tmp
      emitCommitted(next)
      return next
    })
  }

  const updateField = (id: string, patch: Partial<RunInputDef>) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id)
      if (idx === -1) return prev

      const candidate: RunInputDef = { ...prev[idx].draft, ...patch }
      const siblings = committedSiblings(prev, id)
      const errors = validateRunInput(candidate, siblings)

      const next = [...prev]
      next[idx] = {
        ...prev[idx],
        draft: candidate,
        errors,
        committed: errors.length === 0 ? candidate : prev[idx].committed,
      }

      if (errors.length === 0) {
        emitCommitted(next)
      }

      return next
    })
  }

  const updateOption = (row: RowState, index: number, value: string) => {
    const options = [...(row.draft.options ?? [])]
    options[index] = value
    updateField(row.id, { options })
  }

  const addOption = (row: RowState) => {
    updateField(row.id, { options: [...(row.draft.options ?? []), ''] })
  }

  const removeOption = (row: RowState, index: number) => {
    updateField(row.id, { options: (row.draft.options ?? []).filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const def = row.draft
        const buckets = classifyErrors(row.errors)
        const fieldId = row.id

        return (
          <div key={row.id} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Run Input {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => moveRow(row.id, -1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Move down"
                  disabled={index === rows.length - 1}
                  onClick={() => moveRow(row.id, 1)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Remove run input"
                  onClick={() => removeRow(row.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-key`}>Key</Label>
                <Input
                  id={`${fieldId}-key`}
                  value={def.key}
                  onChange={(e) => updateField(row.id, { key: e.target.value })}
                  className={cn(buckets.key.length > 0 && 'border-destructive')}
                />
                <FieldErrors messages={buckets.key} />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-label`}>Label</Label>
                <Input
                  id={`${fieldId}-label`}
                  value={def.label}
                  onChange={(e) => updateField(row.id, { label: e.target.value })}
                  className={cn(buckets.label.length > 0 && 'border-destructive')}
                />
                <FieldErrors messages={buckets.label} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-type`}>Field type</Label>
                <Select
                  value={def.fieldType}
                  onValueChange={(v) => updateField(row.id, { fieldType: v as RunInputFieldType })}
                >
                  <SelectTrigger id={`${fieldId}-type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((ft) => (
                      <SelectItem key={ft.value} value={ft.value}>
                        {ft.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldErrors messages={buckets.fieldType} />
              </div>

              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <input
                    id={`${fieldId}-required`}
                    type="checkbox"
                    checked={def.required}
                    onChange={(e) => updateField(row.id, { required: e.target.checked })}
                    className="h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <Label htmlFor={`${fieldId}-required`} className="cursor-pointer">
                    Required
                  </Label>
                </div>
              </div>
            </div>

            {def.fieldType === 'select' && (
              <div className="space-y-1">
                <Label>Options</Label>
                <div className="space-y-1">
                  {(def.options ?? []).map((option, optIndex) => (
                    <div key={optIndex} className="flex items-center gap-1">
                      <Input
                        aria-label={`Option ${optIndex + 1}`}
                        value={option}
                        onChange={(e) => updateOption(row, optIndex, e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label="Remove option"
                        onClick={() => removeOption(row, optIndex)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => addOption(row)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add option
                </Button>
                <FieldErrors messages={buckets.options} />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-default`}>Default value</Label>
              {def.fieldType === 'select' ? (
                <Select
                  value={def.defaultValue !== undefined ? String(def.defaultValue) : ''}
                  onValueChange={(v) => updateField(row.id, { defaultValue: v || undefined })}
                  disabled={(def.options ?? []).length === 0}
                >
                  <SelectTrigger id={`${fieldId}-default`}>
                    <SelectValue placeholder="No default" />
                  </SelectTrigger>
                  <SelectContent>
                    {(def.options ?? []).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`${fieldId}-default`}
                  type={def.fieldType === 'number' ? 'number' : 'text'}
                  value={def.defaultValue !== undefined ? String(def.defaultValue) : ''}
                  onChange={(e) =>
                    updateField(row.id, {
                      defaultValue:
                        e.target.value === ''
                          ? undefined
                          : def.fieldType === 'number'
                            ? Number(e.target.value)
                            : e.target.value,
                    })
                  }
                />
              )}
              <FieldErrors messages={buckets.defaultValue} />
            </div>

            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-placeholder`}>Placeholder</Label>
              <Input
                id={`${fieldId}-placeholder`}
                value={def.placeholder ?? ''}
                onChange={(e) =>
                  updateField(row.id, { placeholder: e.target.value || undefined })
                }
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-help`}>Help text</Label>
              <Textarea
                id={`${fieldId}-help`}
                rows={2}
                value={def.helpText ?? ''}
                onChange={(e) => updateField(row.id, { helpText: e.target.value || undefined })}
              />
            </div>

            <FieldErrors messages={buckets.other} />
          </div>
        )
      })}

      <Button
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={rows.length >= MAX_RUN_INPUTS}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add Run Input
      </Button>
    </div>
  )
}
