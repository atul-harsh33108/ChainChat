import { Link, useParams, useNavigate } from 'react-router-dom'
import { useOrganization, useUser } from '@clerk/clerk-react'
import { useWorkflows, useCreateWorkflow } from '@/hooks/workflows'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import { latestVersion } from '@/lib/graph'
import { Plus, GitFork, Workflow, ArrowRight } from 'lucide-react'

export function WorkflowListPage() {
  const { workspaceId } = useParams()
  const { organization } = useOrganization()
  const { user } = useUser()
  const navigate = useNavigate()
  const activeId = workspaceId || organization?.id || user?.id
  const { data: workflows, isLoading } = useWorkflows(activeId)
  const create = useCreateWorkflow()

  const handleCreate = async () => {
    if (!activeId) return
    try {
      const created = await create.mutateAsync({
        workspace_id: activeId,
        name: 'Untitled workflow',
        description: '',
      })
      // Content is authored in the builder, which saves the first version.
      navigate(`/app/w/${activeId}/workflows/${created.id}`)
    } catch (err) {
      toast({
        title: 'Could not create workflow',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="page-shell">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label mb-2">Library</p>
          <h1 className="page-title">Workflows</h1>
          <p className="page-subtitle">Build and manage your team’s AI prompt chains.</p>
        </div>
        <Button onClick={handleCreate} disabled={create.isPending}>
          <Plus className="mr-2 h-4 w-4" />
          New workflow
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : workflows?.length ? (
        <div className="grid gap-3">
          {workflows.map((wf) => {
            const version = latestVersion(wf.versions)
            const graph = version?.graph
            const nodeCount = graph?.nodes?.length ?? 0
            const edgeCount = graph?.edges?.length ?? 0
            return (
              <Link key={wf.id} to={`/app/w/${activeId}/workflows/${wf.id}`}>
                <Card className="group hover:-translate-y-0.5 hover:shadow-lift">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <Workflow className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="truncate text-lg">{wf.name}</CardTitle>
                          <CardDescription className="mt-1 line-clamp-1">
                            {wf.description || 'No description'}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {wf.parent_id && (
                          <Badge variant="soft">
                            <GitFork className="mr-1 h-3 w-3" />
                            Remix
                          </Badge>
                        )}
                        {version && <Badge variant="outline">v{version.version_number}</Badge>}
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {nodeCount} nodes · {edgeCount} connections
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Workflow className="h-5 w-5" />
            </div>
            <p className="font-display text-lg font-semibold tracking-tight">No workflows yet</p>
            <CardDescription className="mx-auto mt-1 max-w-sm">
              Create your first prompt chain and start building multi-step AI work.
            </CardDescription>
            <Button className="mt-5" onClick={handleCreate} disabled={create.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              New workflow
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
