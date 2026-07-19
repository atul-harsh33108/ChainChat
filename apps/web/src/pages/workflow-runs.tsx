import { useParams, Link } from 'react-router-dom'
import { useOrganization } from '@clerk/clerk-react'
import { useWorkflow, useExecutions } from '@/hooks/workflows'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Clock, CheckCircle2, XCircle } from 'lucide-react'

export function WorkflowRunsPage() {
  const { workspaceId, workflowId } = useParams()
  const { organization } = useOrganization()
  const activeId = workspaceId || organization?.id
  const { data: workflow, isLoading: wfLoading } = useWorkflow(workflowId)
  const { data: executions, isLoading: runsLoading } = useExecutions(workflowId)

  if (wfLoading || runsLoading) return <RunsSkeleton />

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/app/w/${activeId}/workflows/${workflowId}`}>
          <Button variant="ghost" size="icon">
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
                    {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Pending'}
                  </span>
                  {run.latencyMs && <span>{run.latencyMs}ms</span>}
                  {run.costEstimateUsd && <span>${run.costEstimateUsd.toFixed(4)}</span>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{run.steps.length} steps · Output keys: {Object.keys(run.outputContext).join(', ') || 'none'}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <CardDescription>No runs yet. Run the workflow from the builder to see results here.</CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const icon =
    status === 'success' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />
  return (
    <Badge variant={status === 'success' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'}>
      {icon}
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
