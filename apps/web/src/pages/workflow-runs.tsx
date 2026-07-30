import { useParams, Link } from 'react-router-dom'
import { useOrganization, useUser } from '@clerk/clerk-react'
import { useWorkflow, useExecutions } from '@/hooks/workflows'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { ExecutionStatus } from '@/types'

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
                {run.steps.map((step) => (
                  <div key={step.id} className="rounded border p-2">
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span className="truncate">{step.step_key}</span>
                      <span className="text-muted-foreground">
                        {step.status}
                        {step.retry_count > 0 && ` · ${step.retry_count} retries`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{step.model_key}</p>
                    {step.outputs?.text && (
                      <p className="mt-1 text-sm whitespace-pre-wrap">{step.outputs.text}</p>
                    )}
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
