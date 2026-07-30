import { Link, useParams, useNavigate } from 'react-router-dom'
import { useOrganization, useUser } from '@clerk/clerk-react'
import { useWorkflows, useCreateWorkflow } from '@/hooks/workflows'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/hooks/use-toast'
import { latestVersion } from '@/lib/graph'
import { Plus, GitFork } from 'lucide-react'

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
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-muted-foreground">Build and manage your team's AI prompt chains.</p>
        </div>
        <Button onClick={handleCreate} disabled={create.isPending}>
          <Plus className="h-4 w-4 mr-2" />
          New workflow
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : workflows?.length ? (
        <div className="grid gap-4">
          {workflows.map((wf) => {
            const version = latestVersion(wf.versions)
            const graph = version?.graph
            const nodeCount = graph?.nodes?.length ?? 0
            const edgeCount = graph?.edges?.length ?? 0
            return (
              <Link key={wf.id} to={`/app/w/${activeId}/workflows/${wf.id}`}>
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{wf.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        {wf.parent_id && (
                          <Badge variant="secondary">
                            <GitFork className="h-3 w-3 mr-1" />Remix
                          </Badge>
                        )}
                        {version && <Badge variant="outline">v{version.version_number}</Badge>}
                      </div>
                    </div>
                    <CardDescription>{wf.description || 'No description'}</CardDescription>
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
        <Card>
          <CardContent className="py-16 text-center">
            <CardDescription>No workflows yet. Create your first prompt chain.</CardDescription>
            <Button className="mt-4" onClick={handleCreate} disabled={create.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              New workflow
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
