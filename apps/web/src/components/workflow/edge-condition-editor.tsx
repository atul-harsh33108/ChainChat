import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EdgeCondition, EdgeConditionOp } from '@/types'

interface EdgeConditionEditorProps {
  /** Undefined when the edge is unconditional (always taken). */
  condition: EdgeCondition | undefined
  /** The upstream Prompt node's Step_Reference_Key the condition evaluates
   * against, or undefined when the Decision node has no single resolvable
   * upstream Prompt node (surfaced as a build-time error, not fixed up here). */
  sourceStepKey: string | undefined
  onChange: (next: EdgeCondition | undefined) => void
}

const OPS: { value: EdgeConditionOp; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'not_empty', label: 'Is not empty' },
]

const DEFAULT_CONDITION: EdgeCondition = { op: 'contains', value: '' }

/**
 * Edits the branch condition on a single edge leaving a Decision_Node. The
 * condition gates whether the engine runs the downstream step: it is
 * evaluated against `sourceStepKey`'s rendered output text at run time.
 */
export function EdgeConditionEditor({
  condition,
  sourceStepKey,
  onChange,
}: EdgeConditionEditorProps) {
  const enabled = condition !== undefined
  const current = condition ?? DEFAULT_CONDITION

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {sourceStepKey ? (
          <>
            Evaluated against <span className="font-mono">{sourceStepKey}</span>'s output.
          </>
        ) : (
          'This Decision node has no single upstream Prompt node to branch on yet.'
        )}
      </p>

      <div className="flex items-center gap-2">
        <input
          id="edge-condition-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? DEFAULT_CONDITION : undefined)}
          className="h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <Label htmlFor="edge-condition-enabled" className="cursor-pointer">
          Gate this branch on a condition
        </Label>
      </div>

      {enabled && (
        <>
          <div className="space-y-1">
            <Label htmlFor="edge-condition-op">Condition</Label>
            <Select
              value={current.op}
              onValueChange={(v) => onChange({ ...current, op: v as EdgeConditionOp })}
            >
              <SelectTrigger id="edge-condition-op">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {current.op !== 'not_empty' && (
            <div className="space-y-1">
              <Label htmlFor="edge-condition-value">Value</Label>
              <Input
                id="edge-condition-value"
                value={current.value ?? ''}
                onChange={(e) => onChange({ ...current, value: e.target.value })}
                placeholder={current.op === 'contains' ? 'e.g. urgent' : 'exact text'}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}


