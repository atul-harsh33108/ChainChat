import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { buildInputPayload, isBlank } from '@/lib/run-inputs'
import type { RunInputDef } from '@/types'

interface RunDialogProps {
  /** Declared Run_Inputs, pre-sorted in declaration order (Req 2.2). */
  runInputs: RunInputDef[]
  onCancel: () => void
  onConfirm: (inputPayload: Record<string, unknown>) => void
}

/** Pre-fills each field with its default value, stringified (Req 2.3). */
function seedValues(runInputs: RunInputDef[]): Record<string, string> {
  const seeded: Record<string, string> = {}
  for (const def of runInputs) {
    seeded[def.key] = def.defaultValue === undefined ? '' : String(def.defaultValue)
  }
  return seeded
}

/**
 * Collects values for a workflow's declared Run_Inputs before an
 * Execution_Request is submitted. Mount/unmount is controlled by the
 * parent conditionally rendering this component; it always renders with
 * `open`, and treats any non-confirm dismissal (Escape, overlay click, the
 * dialog's own close button, or the Cancel button) as a cancel (Req 2.7).
 */
export function RunDialog({ runInputs, onCancel, onConfirm }: RunDialogProps) {
  const [values, setValues] = useState<Record<string, string>>(() => seedValues(runInputs))
  const [invalid, setInvalid] = useState<Record<string, boolean>>({})

  const setValue = (key: string, next: string, required: boolean) => {
    setValues((prev) => ({ ...prev, [key]: next }))
    // Clear the invalid marking as soon as a required field receives a
    // non-whitespace value (Req 3.5).
    if (required && !isBlank(next)) {
      setInvalid((prev) => (prev[key] ? { ...prev, [key]: false } : prev))
    }
  }

  const handleConfirm = () => {
    const nextInvalid: Record<string, boolean> = {}
    let hasInvalid = false
    for (const def of runInputs) {
      if (def.required && isBlank(values[def.key])) {
        nextInvalid[def.key] = true
        hasInvalid = true
      }
    }

    if (hasInvalid) {
      // Block submission, mark the offending fields invalid, and leave
      // every submitted value untouched (Req 3.2, 3.4).
      setInvalid(nextInvalid)
      return
    }

    onConfirm(buildInputPayload(runInputs, values))
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run workflow</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {runInputs.map((def) => {
            const fieldId = `run-input-${def.key}`
            const isInvalid = invalid[def.key] === true
            const errorClasses = 'border-destructive focus-visible:ring-destructive'

            return (
              <div key={def.key} className="space-y-1">
                <Label htmlFor={fieldId}>{def.label}</Label>

                {def.fieldType === 'select' ? (
                  <Select
                    value={values[def.key] ?? ''}
                    onValueChange={(next) => setValue(def.key, next, def.required)}
                  >
                    <SelectTrigger id={fieldId} className={cn(isInvalid && errorClasses)}>
                      <SelectValue placeholder={def.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {(def.options ?? []).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : def.fieldType === 'textarea' ? (
                  <Textarea
                    id={fieldId}
                    value={values[def.key] ?? ''}
                    placeholder={def.placeholder}
                    onChange={(e) => setValue(def.key, e.target.value, def.required)}
                    className={cn(isInvalid && errorClasses)}
                  />
                ) : (
                  <Input
                    id={fieldId}
                    type={def.fieldType === 'number' ? 'number' : 'text'}
                    value={values[def.key] ?? ''}
                    placeholder={def.placeholder}
                    onChange={(e) => setValue(def.key, e.target.value, def.required)}
                    className={cn(isInvalid && errorClasses)}
                  />
                )}

                {def.helpText && <p className="text-xs text-muted-foreground">{def.helpText}</p>}
                {isInvalid && <p className="text-xs text-destructive">This field is required.</p>}
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Run</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
