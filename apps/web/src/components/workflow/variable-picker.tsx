import * as React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Braces } from 'lucide-react'

export interface VariablePickerProps {
  /** Run_Input_Keys union upstream Step_Reference_Keys (Req 7.1, 7.2). */
  entries: string[]
  targetRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
}

/**
 * A dropdown trigger listing variable references insertable into a Prompt
 * node's text. Selecting an entry inserts `{key}` into the target textarea
 * at the current selection/cursor (or at the end when neither is
 * established), then restores focus with the cursor placed immediately
 * after the inserted placeholder (Req 7.3, 7.4, 7.5).
 */
export function VariablePicker({ entries, targetRef, value, onChange }: VariablePickerProps) {
  const handleSelect = (key: string) => {
    const placeholder = `{${key}}`
    const el = targetRef.current

    // Default to the end of the text when the textarea has never been
    // focused / has no established selection state (Req 7.5).
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length

    const next = value.slice(0, start) + placeholder + value.slice(end)
    onChange(next)

    const cursor = start + placeholder.length
    if (el) {
      // Restore focus and place the cursor right after the inserted
      // placeholder. Done imperatively via the DOM ref since the `value`
      // update above is a batched React state change, but focus/selection
      // is plain DOM state that can be set synchronously.
      el.focus()
      el.setSelectionRange(cursor, cursor)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Braces className="mr-2 h-4 w-4" />
          Insert variable
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {entries.length === 0 ? (
          <DropdownMenuItem disabled>No variables available yet</DropdownMenuItem>
        ) : (
          entries.map((entry) => (
            <DropdownMenuItem key={entry} onSelect={() => handleSelect(entry)}>
              {entry}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
