import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Connection,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useOrganization } from '@clerk/clerk-react'
import { useWorkflow, useUpdateWorkflow, useCreateWorkflow } from '@/hooks/workflows'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import type { WorkflowNode } from '@/types'
import { Play, Save, Share2, GitFork, ArrowLeft, History } from 'lucide-react'

const nodeTypes = {}

function Builder() {
  const { workspaceId, workflowId } = useParams()
  const { organization } = useOrganization()
  const navigate = useNavigate()
  const activeId = workspaceId || organization?.id
  const isNew = workflowId === 'new'

  const { data: existing, isLoading } = useWorkflow(isNew ? undefined : workflowId)
  const updateWorkflow = useUpdateWorkflow()
  const createWorkflow = useCreateWorkflow()

  const [name, setName] = useState('Untitled workflow')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setDescription(existing.description || '')
      setIsPublic(existing.isPublic)
      setNodes(
        existing.nodes.map((n) => ({
          id: n.id,
          type: n.type === 'start' ? 'input' : 'default',
          position: n.position,
          data: { label: n.label || n.type, config: n.config },
        }))
      )
      setEdges(
        existing.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
        }))
      )
    }
  }, [existing, setEdges, setNodes])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const addNode = (type: WorkflowNode['type']) => {
    const id = `${type}-${nodes.length + 1}`
    setNodes((prev) => [
      ...prev,
      {
        id,
        type: type === 'start' ? 'input' : 'default',
        position: { x: 250 + prev.length * 30, y: 150 + prev.length * 30 },
        data: { label: type, config: { modelKey: 'openai/gpt-4o', temperature: 0.7 } },
      },
    ])
  }

  const handleSave = async () => {
    if (!activeId) return
    const payload = {
      name,
      description,
      isPublic,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type === 'input' ? 'start' : (n.data.label as WorkflowNode['type']),
        position: n.position,
        label: n.data.label as string,
        config: n.data.config,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
      })),
    }
    try {
      if (isNew) {
        const created = await createWorkflow.mutateAsync({ workspaceId: activeId, ...payload })
        toast({ title: 'Workflow created' })
        navigate(`/app/w/${activeId}/workflows/${created.id}`)
      } else if (workflowId) {
        await updateWorkflow.mutateAsync({ id: workflowId, ...payload })
        toast({ title: 'Workflow saved' })
      }
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  if (isLoading && !isNew) return <BuilderSkeleton />

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/app/w/${activeId}/workflows`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 border-none text-lg font-semibold px-0 focus-visible:ring-0"
            />
          </div>
          {isPublic && <Badge variant="outline">Public</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Share2 className="h-4 w-4 mr-2" />Share
          </Button>
          <Button variant="outline" size="sm">
            <GitFork className="h-4 w-4 mr-2" />Remix
          </Button>
          <Link to={workflowId && !isNew ? `/app/w/${activeId}/workflows/${workflowId}/runs` : '#'}>
            <Button variant="outline" size="sm" disabled={isNew}>
              <History className="h-4 w-4 mr-2" />Runs
            </Button>
          </Link>
          <Button size="sm" onClick={handleSave} disabled={updateWorkflow.isPending || createWorkflow.isPending}>
            <Save className="h-4 w-4 mr-2" />Save
          </Button>
          <Button size="sm" disabled={isNew}>
            <Play className="h-4 w-4 mr-2" />Run
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        <aside className="w-80 border-l bg-card p-4 overflow-auto">
          <h2 className="font-semibold mb-4">Workflow settings</h2>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="visibility">Visibility</Label>
              <Select value={isPublic ? 'public' : 'private'} onValueChange={(v) => setIsPublic(v === 'public')}>
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private to workspace</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="my-6" />

          <h2 className="font-semibold mb-4">Add node</h2>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => addNode('prompt')}>Prompt</Button>
            <Button variant="outline" onClick={() => addNode('decision')}>Decision</Button>
            <Button variant="outline" onClick={() => addNode('output')}>Output</Button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function BuilderSkeleton() {
  return (
    <div className="p-8">
      <Skeleton className="h-10 w-64 mb-4" />
      <Skeleton className="h-[60vh]" />
    </div>
  )
}

export function WorkflowBuilderPage() {
  return (
    <ReactFlowProvider>
      <Builder />
    </ReactFlowProvider>
  )
}
