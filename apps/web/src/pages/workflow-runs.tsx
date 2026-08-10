import { Fragment } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useOrganization, useUser } from '@clerk/clerk-react'
import { useWorkflow, useExecutions } from '@/hooks/workflows'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { ExecutionStatus } from '@/types'
import { classifyInputValue, hasNoInputs } from '@/lib/input-payload-display'
import { RunStepsList } from '@/components/workflow/run-steps-list'

export function WorkflowRunsPage() {
  const { workspaceId, workflowId } = useParams()
  const { organization } = useOrganization()
  const { user } = useUser()
  const activeId = workspaceId || organization?.id || user?.id
  const { data: workflow, isLoading: wfLoading } = useWorkflow(workflowId)
  const { data: executions, isLoading: runsLoading } = useExecutions(workflowId)

  if (wfLoading || runsLoading) return <RunsSkeleton />

  return (
    <div className="page-shell">
      <div className="mb-8 flex items-center gap-3">
        <Link to={`/app/w/${activeId}/workflows/${workflowId}`}>
          <Button variant="ghost" size="icon" aria-label="Back to builder">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <p className="section-label mb-1">Execution history</p>
          <h1 className="page-title text-2xl md:text-3xl">{workflow?.name}</h1>
          <p className="page-subtitle">Past runs and step-level outputs.</p>
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
                <RunStepsList steps={run.steps} />
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
    <div className="page-shell space-y-4">
      <Skeleton className="h-10 w-64 rounded-xl" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  )
}
