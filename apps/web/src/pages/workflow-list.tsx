import { Link, useParams } from 'react-router-dom'
import { useOrganization } from '@clerk/clerk-react'
import { useWorkflows, useCreateWorkflow } from '@/hooks/workflows'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Globe, GitFork } from 'lucide-react'

export function WorkflowListPage() {
  const { workspaceId } = useParams()
  const { organization } = useOrganization()
  const activeId = workspaceId || organization?.id
  const { data: workflows, isLoading } = useWorkflows(activeId)
  const create = useCreateWorkflow()

  const handleCreate = () => {
    if (!activeId) return
    create.mutate({
      workspaceId: activeId,
      name: 'Untitled workflow',
      description: '',
      variables: [],
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 100, y: 150 },
          label: 'Start',
          config: {},
        },
        {
          id: 'prompt-1',
          type: 'prompt',
          position: { x: 350, y: 150 },
          label: 'Prompt',
          config: { modelKey: 'openai/gpt-4o', temperature: 0.7 },
        },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'prompt-1' }],
    })
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
          {workflows.map((wf) => (
            <Link key={wf.id} to={`/app/w/${activeId}/workflows/${wf.id}`}>
              <Card className="hover:bg-accent/50 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{wf.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      {wf.isPublic && <Badge variant="outline"><Globe className="h-3 w-3 mr-1" />Public</Badge>}
                      {wf.sourceWorkflowId && <Badge variant="secondary"><GitFork className="h-3 w-3 mr-1" />Remix</Badge>}
                    </div>
                  </div>
                  <CardDescription>
                    {wf.description || 'No description'} · Version {wf.version}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {wf.nodes.length} nodes · {wf.edges.length} connections
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
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
