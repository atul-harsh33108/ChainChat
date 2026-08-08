import { Fragment } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrganization, useUser } from '@clerk/clerk-react'
import { useWorkflow, useExecutions } from '@/hooks/workflows'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { ExecutionStatus, StepStatus } from '@/types'
import { classifyInputValue, hasNoInputs } from '@/lib/input-payload-display'
import { StepOutputPanel } from '@/components/workflow/step-output-panel'

export function WorkflowRunsPage() {
  const { workspaceId, workflowId } = useParams()
  const { organization } = useOrganization()
  const { user } = useUser()
  const activeId = workspaceId || organization?.id || user?.id
  const { data: workflow, isLoading: wfLoading } = useWorkflow(workflowId)
  const { data: executions, isLoading: runsLoading } = useExecutions(workflowId)

  if (wfLoading || runsLoading) return <RunsSkeleton />

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/app/w/${activeId}/workflows/${workflowId}`}>
          <Button variant="ghost" size="icon" aria-label="Back to builder">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{workflow?.name} · Runs</h1>
          <p className="text-muted-foreground">Execution history and outputs.</p>
        </div>
      </div>

      {executions?.length ? (
        <div className="grid gap-4">
          {executions.map((run) => (
            <Card key={run.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Run {run.id.slice(0, 8)}</CardTitle>
                  <StatusBadge status={run.status} />
                </div>
                <CardDescription className="flex items-center gap-4">
                  <span className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                  <span>{run.steps.length} steps</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {run.error_message && (
                  <p className="text-sm text-destructive">{run.error_message}</p>
                )}
                {hasNoInputs(run.input_payload) ? (
                  <p className="text-sm text-muted-foreground">No inputs</p>
                ) : (
                  <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
                    {Object.entries(run.input_payload!).map(([key, value]) => (
                      <Fragment key={key}>
                        <dt className="font-medium text-muted-foreground">{key}</dt>
                        <dd>
                          {classifyInputValue(value) === 'scalar' ? (
                            String(value)
                          ) : (
                            <pre className="whitespace-pre-wrap text-xs">
                              {JSON.stringify(value, null, 2)}
                            </pre>
                          )}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                )}
                {run.steps.map((step) => (
                  <div
                    key={step.id}
                    className={`rounded border p-2 ${step.status === 'skipped' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span className="truncate">{step.step_key}</span>
                      <StepStatusLabel
                        status={step.status}
                        retryCount={step.retry_count}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {step.step_type === 'format' ? `formats as ${step.format}` : step.model_key}
                    </p>
                    {step.status === 'skipped' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Skipped: its branch condition was not met.
                      </p>
                    )}
                    <StepOutputPanel
                      stepKey={step.step_key}
                      outputs={step.outputs}
                      format={step.format}
                    />
                    {step.error_message && (
                      <p className="mt-1 text-xs text-destructive">{step.error_message}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <CardDescription>
              No runs yet. Press Run in the builder to execute this workflow.
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** A step's status plus its retry count, right-aligned next to its key. A
 * skipped step (its branch condition was not met, or it cascades from a
 * skipped upstream decision) is visually de-emphasised rather than treated
 * as an error. */
function StepStatusLabel({ status, retryCount }: { status: StepStatus; retryCount: number }) {
  if (status === 'skipped') {
    return <span className="text-muted-foreground italic">skipped</span>
  }
  return (
    <span className="text-muted-foreground">
      {status}
      {retryCount > 0 && ` · ${retryCount} retries`}
    </span>
  )
}

function StatusBadge({ status }: { status: ExecutionStatus }) {
  if (status === 'completed') {
    return (
      <Badge>
        <CheckCircle2 className="h-3 w-3 mr-1" />
        completed
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" />
        failed
      </Badge>
    )
  }
  return (
    <Badge variant="secondary">
      {status === 'running' || status === 'pending' ? (
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
      ) : (
        <XCircle className="h-3 w-3 mr-1" />
      )}
      {status}
    </Badge>
  )
}

function RunsSkeleton() {
  return (
    <div className="p-8 max-w-5xl space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  )
}
