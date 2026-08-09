import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { StepOutputPanel } from '@/components/workflow/step-output-panel'
import { terminalStepKeys } from '@/lib/run-steps'
import { cn } from '@/lib/utils'
import type { StepOutputs, StepStatus } from '@/types'

interface RunStep {
  step_key: string
  depends_on: string[]
  status: StepStatus
  retry_count: number
  outputs: StepOutputs | null
  error_message: string | null
  /** Absent on the SSE stream event shape; present on the full ExecutionStep. */
  model_key?: string
  step_type?: 'prompt' | 'format'
  format?: string | null
}

interface RunStepsListProps {
  steps: RunStep[]
  className?: string
}

/**
 * A run's steps, with only the "terminal" ones (nothing downstream depends
 * on them -- typically an Output_Node's format step, or the last Prompt_Node
 * when there's no Output_Node) expanded by default. Every other step -- an
 * intermediate Prompt_Node feeding an Output_Node that just reformats the
 * same text, for instance -- is collapsed to a single summary row you can
 * expand on demand, so a run with N intermediate steps doesn't show the same
 * content N times over by default.
 */
export function RunStepsList({ steps, className }: RunStepsListProps) {
  const terminal = terminalStepKeys(steps)

  return (
    <div className={cn('space-y-2', className)}>
      {steps.map((step) => (
        <RunStepRow key={step.step_key} step={step} defaultExpanded={terminal.has(step.step_key)} />
      ))}
    </div>
  )
}

function RunStepRow({ step, defaultExpanded }: { step: RunStep; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className={cn('rounded border p-2', step.status === 'skipped' && 'opacity-60')}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-1 truncate">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{step.step_key}</span>
          {!defaultExpanded && (
            <span className="text-xs font-normal text-muted-foreground">intermediate</span>
          )}
        </span>
        <StepStatusLabel status={step.status} retryCount={step.retry_count} />
      </button>

      {expanded && (
        <>
          {step.model_key && (
            <p className="mt-1 text-xs text-muted-foreground">
              {step.step_type === 'format' ? `formats as ${step.format}` : step.model_key}
            </p>
          )}
          {step.status === 'skipped' && (
            <p className="mt-1 text-xs text-muted-foreground">
              Skipped: its branch condition was not met.
            </p>
          )}
          <StepOutputPanel
            stepKey={step.step_key}
            outputs={step.outputs}
            format={step.format ?? null}
          />
          {step.error_message && (
            <p className="mt-1 text-xs text-destructive">{step.error_message}</p>
          )}
        </>
      )}
    </div>
  )
}

/** A step's status plus its retry count. A skipped step (its branch
 * condition was not met, or it cascades from a skipped upstream decision) is
 * visually de-emphasised rather than treated as an error. */
function StepStatusLabel({ status, retryCount }: { status: StepStatus; retryCount: number }) {
  if (status === 'skipped') {
    return <span className="text-xs text-muted-foreground italic">skipped</span>
  }
  return (
    <span className="text-xs text-muted-foreground">
      {status}
      {retryCount > 0 && ` · ${retryCount} retries`}
    </span>
  )
}
