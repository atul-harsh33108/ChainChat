import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Connection,
  type Node,
  type Edge,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useOrganization, useUser } from '@clerk/clerk-react'
import {
  useWorkflow,
  useUpdateWorkflow,
  useCreateWorkflow,
  useCreateVersion,
  useRunWorkflow,
  useForkWorkflow,
  useExecution,
  useApplyTemplate,
  usePublishVersion,
  useUnpublishVersion,
  useCreateTemplate,
  GraphValidationError,
} from '@/hooks/workflows'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import type {
  EdgeCondition,
  GraphNode,
  NodeConfig,
  NodeType,
  OutputDisplayFormat,
  Workflow,
  WorkflowGraph,
} from '@/types'
import {
  DEFAULT_MODEL,
  FREE_MODELS,
  EMPTY_GRAPH,
  latestVersion,
  executableAncestors,
  stepReferenceKey,
  decisionSourceStepKey,
} from '@/lib/graph'
import { getRunInputs } from '@/lib/run-inputs'
import { RunInputEditor } from '@/components/workflow/run-input-editor'
import { VariablePicker } from '@/components/workflow/variable-picker'
import { EdgeConditionEditor } from '@/components/workflow/edge-condition-editor'
import { RunStepsList } from '@/components/workflow/run-steps-list'
import { RunDialog } from '@/components/workflow/run-dialog'
import { PresenceIndicator } from '@/components/workflow/presence-indicator'
import { CommentPanel } from '@/components/workflow/comment-panel'
import { useCollaborationStream, usePresenceHeartbeat } from '@/hooks/collaboration'
import { Play, Save, GitFork, ArrowLeft, History, Trash2, Upload, X, BookmarkPlus } from 'lucide-react'

/** React Flow node data carried in the canvas. */
interface NodeData {
  label: string
  nodeType: NodeType
  config: NodeConfig
}

/** React Flow edge data carried in the canvas. Only meaningful when the
 * edge's source is a Decision node. */
interface EdgeData {
  condition?: EdgeCondition
}

function reactFlowType(type: NodeType): string {
  if (type === 'start') return 'input'
  if (type === 'output') return 'output'
  return 'default'
}
/** The newest saved graph of the workflow being edited (empty for new ones). */
function initialGraph(existing: Workflow | null): WorkflowGraph {
  return latestVersion(existing?.versions)?.graph || EMPTY_GRAPH
}

function toFlowNodes(graph: WorkflowGraph): Node<NodeData>[] {
  return (graph.nodes || []).map((n) => ({
    id: n.id,
    type: reactFlowType(n.type),
    position: n.position || { x: 0, y: 0 },
    data: {
      label: n.label || n.type,
      nodeType: n.type,
      config: n.config || {},
    },
  }))
}

function toFlowEdges(graph: WorkflowGraph): Edge<EdgeData>[] {
  return (graph.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    data: { condition: e.condition },
  }))
}

function Builder({ existing }: { existing: Workflow | null }) {
  const { workspaceId, workflowId } = useParams()
  const { organization } = useOrganization()
  const { user } = useUser()
  const navigate = useNavigate()
  const activeId = workspaceId || organization?.id || user?.id
  const isNew = workflowId === 'new'
  const updateWorkflow = useUpdateWorkflow()
  const createWorkflow = useCreateWorkflow()
  const createVersion = useCreateVersion()
  const runWorkflow = useRunWorkflow()
  const forkWorkflow = useForkWorkflow()
  const publishVersion = usePublishVersion()
  const unpublishVersion = useUnpublishVersion()
  const createTemplate = useCreateTemplate()

  // The page gates rendering until the workflow has loaded and keys this
  // component by workflow id, so state initializes straight from props. See
  // react.dev/learn/you-might-not-need-an-effect (no hydration effect needed).
  const [name, setName] = useState(existing?.name ?? 'Untitled workflow')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>(
    toFlowNodes(initialGraph(existing))
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<EdgeData>(
    toFlowEdges(initialGraph(existing))
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [pendingRun, setPendingRun] = useState<{
    workflowId: string
    graph: WorkflowGraph
  } | null>(null)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const { data: run } = useExecution(runId ?? undefined)
  const notifiedRef = useRef<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { presence, lastChange } = useCollaborationStream(isNew ? undefined : workflowId)
  usePresenceHeartbeat(isNew ? undefined : workflowId)

  // Notify once when a run reaches a terminal state.
  useEffect(() => {
    if (!run || notifiedRef.current === run.id) return
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      notifiedRef.current = run.id
      toast({
        title: run.status === 'completed' ? 'Run completed' : `Run ${run.status}`,
        description: run.error_message || undefined,
        variant: run.status === 'completed' ? undefined : 'destructive',
      })
    }
  }, [run])

  // Apply remote graph changes from collaborators in real time.
  useEffect(() => {
    if (!lastChange) return
    if (lastChange.type === 'node_upsert' && lastChange.node) {
      setNodes((prev) => {
        const exists = prev.some((n) => n.id === lastChange.node!.id)
        if (exists) {
          return prev.map((n) =>
            n.id === lastChange.node!.id
              ? {
                  ...n,
                  position: lastChange.node!.position || n.position,
                  data: {
                    label: lastChange.node!.label || n.data.label,
                    nodeType: lastChange.node!.type,
                    config: lastChange.node!.config || n.data.config,
                  },
                }
              : n
          )
        }
        return [
          ...prev,
          {
            id: lastChange.node!.id,
            type: reactFlowType(lastChange.node!.type),
            position: lastChange.node!.position || { x: 0, y: 0 },
            data: {
              label: lastChange.node!.label || lastChange.node!.type,
              nodeType: lastChange.node!.type,
              config: lastChange.node!.config || {},
            },
          },
        ]
      })
    } else if (lastChange.type === 'node_delete' && lastChange.node_id) {
      setNodes((prev) => prev.filter((n) => n.id !== lastChange.node_id))
      setEdges((prev) =>
        prev.filter(
          (e) => e.source !== lastChange.node_id && e.target !== lastChange.node_id
        )
      )
    } else if (lastChange.type === 'edge_upsert' && lastChange.edge) {
      setEdges((prev) => {
        const exists = prev.some((e) => e.id === lastChange.edge!.id)
        if (exists) {
          return prev.map((e) =>
            e.id === lastChange.edge!.id
              ? {
                  ...e,
                  source: lastChange.edge!.source,
                  target: lastChange.edge!.target,
                  label: lastChange.edge!.label,
                  data: { condition: lastChange.edge!.condition },
                }
              : e
          )
        }
        return [
          ...prev,
          {
            id: lastChange.edge!.id,
            source: lastChange.edge!.source,
            target: lastChange.edge!.target,
            label: lastChange.edge!.label,
            data: { condition: lastChange.edge!.condition },
          },
        ]
      })
    } else if (lastChange.type === 'edge_delete' && lastChange.edge_id) {
      setEdges((prev) => prev.filter((e) => e.id !== lastChange.edge_id))
    }
  }, [lastChange, setNodes, setEdges])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const addNode = (type: NodeType) => {
    const id = `${type}_${Date.now().toString(36)}`
    setNodes((prev) => [
      ...prev,
      {
        id,
        type: reactFlowType(type),
        position: { x: 250 + prev.length * 40, y: 120 + prev.length * 40 },
        data: {
          label: type === 'prompt' ? 'Prompt' : type,
          nodeType: type,
          config: type === 'prompt' ? { model: DEFAULT_MODEL, temperature: 0.7, prompt: '' } : {},
        },
      },
    ])
    setSelectedId(id)
  }

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) || null,
    [nodes, selectedId]
  )

  const selectedEdge = useMemo(
    () => (edges as Edge<EdgeData>[]).find((e) => e.id === selectedEdgeId) || null,
    [edges, selectedEdgeId]
  )

  /** The Decision node feeding `selectedEdge`, if any -- edges leaving any
   * other node type have no condition to edit. */
  const selectedEdgeSourceNode = useMemo(() => {
    if (!selectedEdge) return null
    return (nodes as Node<NodeData>[]).find((n) => n.id === selectedEdge.source) || null
  }, [selectedEdge, nodes])

  const updateSelectedEdgeCondition = (condition: EdgeCondition | undefined) => {
    if (!selectedEdgeId) return
    setEdges((prev) =>
      (prev as Edge<EdgeData>[]).map((e) =>
        e.id === selectedEdgeId ? { ...e, data: { ...e.data, condition } } : e
      )
    )
  }

  const updateSelected = (patch: Partial<NodeData>) => {
    if (!selectedId) return
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n))
    )
  }

  const updateSelectedConfig = (patch: Partial<NodeConfig>) => {
    if (!selected) return
    updateSelected({ config: { ...selected.data.config, ...patch } })
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setNodes((prev) => prev.filter((n) => n.id !== selectedId))
    setEdges((prev) => prev.filter((e) => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
  }

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return
    setEdges((prev) => prev.filter((e) => e.id !== selectedEdgeId))
    setSelectedEdgeId(null)
  }

  const buildGraph = useCallback((): WorkflowGraph => {
    const graphNodes: GraphNode[] = (nodes as Node<NodeData>[]).map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      label: n.data.label,
      position: n.position,
      config: n.data.config,
    }))
    const graphEdges = (edges as Edge<EdgeData>[]).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
      condition: e.data?.condition,
    }))
    return { nodes: graphNodes, edges: graphEdges }
  }, [nodes, edges])

  const handleSave = async (): Promise<string | null> => {
    if (!activeId) {
      toast({ title: 'No workspace selected', variant: 'destructive' })
      return null
    }
    const graph = buildGraph()
    try {
      let id = workflowId
      if (isNew) {
        const created = await createWorkflow.mutateAsync({
          workspace_id: activeId,
          name,
          description,
        })
        id = created.id
      } else if (id) {
        await updateWorkflow.mutateAsync({ id, name, description })
      }
      if (!id) return null

      // Graph content is stored as a new immutable version.
      await createVersion.mutateAsync({ workflowId: id, graph, changeSummary: 'Edited in builder' })

      toast({ title: isNew ? 'Workflow created' : 'Workflow saved' })
      if (isNew) navigate(`/app/w/${activeId}/workflows/${id}`)
      return id
    } catch (err) {
      toast({
        title: 'Save failed',
        description: errorMessage(err),
        variant: 'destructive',
      })
      return null
    }
  }

  const submitRun = async (
    workflowId: string,
    graph: WorkflowGraph,
    inputPayload: Record<string, unknown>
  ) => {
    try {
      const execution = await runWorkflow.mutateAsync({
        workspaceId: activeId!,
        workflowId,
        graph,
        inputPayload,
      })
      setRunId(execution.id)
      toast({ title: 'Run started', description: `Execution ${execution.id.slice(0, 8)}` })
    } catch (err) {
      toast({ title: 'Run failed', description: errorMessage(err), variant: 'destructive' })
    }
  }

  const handleRun = async () => {
    if (!activeId) return
    // Persist first so the run always matches what is on screen.
    const id = await handleSave()
    if (!id) return

    const graph = buildGraph()
    const declared = getRunInputs(graph)
    if (declared.length > 0) {
      setPendingRun({ workflowId: id, graph })
      return
    }

    await submitRun(id, graph, {})
  }

  const handlePublish = async () => {
    if (!workflowId || isNew) return
    const version = latestVersion(existing?.versions)
    if (!version) {
      toast({ title: 'Save the workflow before publishing', variant: 'destructive' })
      return
    }
    try {
      await publishVersion.mutateAsync({ workflowId, versionId: version.id })
      toast({ title: 'Version published', description: `v${version.version_number}` })
    } catch (err) {
      toast({ title: 'Publish failed', description: errorMessage(err), variant: 'destructive' })
    }
  }

  const handleUnpublish = async () => {
    if (!workflowId || isNew || !existing?.published_version_id) return
    try {
      await unpublishVersion.mutateAsync({
        workflowId,
        versionId: existing.published_version_id,
      })
      toast({ title: 'Version unpublished' })
    } catch (err) {
      toast({ title: 'Unpublish failed', description: errorMessage(err), variant: 'destructive' })
    }
  }

  const openSaveAsTemplate = () => {
    setTemplateName(`${name} template`)
    setTemplateDescription(description)
    setTemplateDialogOpen(true)
  }

  const handleCreateTemplate = async () => {
    if (!templateName.trim()) {
      toast({ title: 'Template name is required', variant: 'destructive' })
      return
    }
    try {
      await createTemplate.mutateAsync({
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        graph: buildGraph(),
        sourceWorkflowId: workflowId && !isNew ? workflowId : undefined,
      })
      toast({ title: 'Template saved', description: templateName.trim() })
      setTemplateDialogOpen(false)
    } catch (err) {
      toast({
        title: 'Could not save template',
        description: errorMessage(err),
        variant: 'destructive',
      })
    }
  }

  const handleFork = async () => {
    if (!activeId || !workflowId || isNew) return
    try {
      const forked = await forkWorkflow.mutateAsync({
        workflowId,
        targetWorkspaceId: activeId,
        newName: `${name} (copy)`,
      })
      toast({ title: 'Workflow remixed', description: forked.name })
      navigate(`/app/w/${activeId}/workflows/${forked.id}`)
    } catch (err) {
      toast({ title: 'Remix failed', description: errorMessage(err), variant: 'destructive' })
    }
  }

  const busy =
    createWorkflow.isPending ||
    updateWorkflow.isPending ||
    createVersion.isPending ||
    runWorkflow.isPending ||
    publishVersion.isPending ||
    unpublishVersion.isPending ||
    createTemplate.isPending

  const savedVersion = latestVersion(existing?.versions)
  const isPublished = !!(savedVersion && existing?.published_version_id === savedVersion.id)

  return (
    <>
      <div className="flex h-screen flex-col">
        <header className="border-b px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/app/w/${activeId}/workflows`}>
              <Button variant="ghost" size="icon" aria-label="Back to workflows">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Workflow name"
              className="h-8 w-64 border-none text-lg font-semibold px-0 focus-visible:ring-0"
            />
            {savedVersion && <Badge variant="outline">v{savedVersion.version_number}</Badge>}
            {isPublished && <Badge>Published</Badge>}
            <PresenceIndicator users={presence} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleFork} disabled={isNew || busy}>
              <GitFork className="h-4 w-4 mr-2" />
              Remix
            </Button>
            <Button variant="outline" size="sm" onClick={openSaveAsTemplate} disabled={busy}>
              <BookmarkPlus className="h-4 w-4 mr-2" />
              Save as template
            </Button>
            {isPublished ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnpublish}
                disabled={isNew || busy}
              >
                <X className="h-4 w-4 mr-2" />
                Unpublish
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={handlePublish} disabled={isNew || busy}>
                <Upload className="h-4 w-4 mr-2" />
                Publish
              </Button>
            )}
            <Link
              to={workflowId && !isNew ? `/app/w/${activeId}/workflows/${workflowId}/runs` : '#'}
            >
              <Button variant="outline" size="sm" disabled={isNew}>
                <History className="h-4 w-4 mr-2" />
                Runs
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleSave} disabled={busy}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button size="sm" onClick={handleRun} disabled={busy}>
              <Play className="h-4 w-4 mr-2" />
              Run
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
              onNodeClick={(_, node) => {
                setSelectedEdgeId(null)
                setSelectedId(node.id)
              }}
              onEdgeClick={(_, edge) => {
                setSelectedId(null)
                setSelectedEdgeId(edge.id)
              }}
              onPaneClick={() => {
                setSelectedId(null)
                setSelectedEdgeId(null)
              }}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>

          <aside className="w-80 border-l bg-card p-4 overflow-auto">
            <h2 className="font-semibold mb-3">Add node</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => addNode('start')}>
                Start
              </Button>
              <Button variant="outline" size="sm" onClick={() => addNode('prompt')}>
                Prompt
              </Button>
              <Button variant="outline" size="sm" onClick={() => addNode('decision')}>
                Decision
              </Button>
              <Button variant="outline" size="sm" onClick={() => addNode('output')}>
                Output
              </Button>
            </div>

            <Separator className="my-4" />

            {selectedEdge ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Edge</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={deleteSelectedEdge}
                    aria-label="Delete edge"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {selectedEdgeSourceNode?.data.nodeType === 'decision' ? (
                  <EdgeConditionEditor
                    condition={selectedEdge.data?.condition}
                    sourceStepKey={decisionSourceStepKey(buildGraph(), selectedEdge.source)}
                    onChange={updateSelectedEdgeCondition}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Only edges leaving a Decision node can carry a branch condition. This edge
                    always runs.
                  </p>
                )}
              </div>
            ) : selected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Node</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={deleteSelected}
                    aria-label="Delete node"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="node-label">Label</Label>
                  <Input
                    id="node-label"
                    value={selected.data.label}
                    onChange={(e) => updateSelected({ label: e.target.value })}
                  />
                </div>

                {selected.data.nodeType === 'prompt' ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="node-model">Model</Label>
                      <Select
                        value={selected.data.config.model || DEFAULT_MODEL}
                        onValueChange={(v) => updateSelectedConfig({ model: v })}
                      >
                        <SelectTrigger id="node-model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FREE_MODELS.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="node-prompt">Prompt</Label>
                      <Textarea
                        id="node-prompt"
                        ref={textareaRef}
                        rows={6}
                        placeholder="Summarise this: {start_node_id}"
                        value={selected.data.config.prompt || ''}
                        onChange={(e) => updateSelectedConfig({ prompt: e.target.value })}
                      />
                      <VariablePicker
                        entries={(() => {
                          const graph = buildGraph()
                          const runInputKeys = getRunInputs(graph).map((d) => d.key)
                          const upstreamKeys = executableAncestors(graph, selected.id).map((id) =>
                            stepReferenceKey(graph.nodes.find((n) => n.id === id)!)
                          )
                          return [...runInputKeys, ...upstreamKeys]
                        })()}
                        targetRef={textareaRef}
                        value={selected.data.config.prompt || ''}
                        onChange={(next) => updateSelectedConfig({ prompt: next })}
                      />
                    </div>
                  </>
                ) : selected.data.nodeType === 'start' ? (
                  <RunInputEditor
                    runInputs={selected.data.config.runInputs ?? []}
                    onChange={(next) => updateSelectedConfig({ runInputs: next })}
                  />
                ) : selected.data.nodeType === 'output' ? (
                  <div className="space-y-1">
                    <Label htmlFor="node-display-format">Display format</Label>
                    <Select
                      value={selected.data.config.displayFormat || 'text'}
                      onValueChange={(v) =>
                        updateSelectedConfig({ displayFormat: v as OutputDisplayFormat })
                      }
                    >
                      <SelectTrigger id="node-display-format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Plain text</SelectItem>
                        <SelectItem value="markdown">Markdown</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Reformats its single upstream node's output when the workflow runs.
                      {selected.data.config.displayFormat === 'json' &&
                        ' Fails gracefully if the upstream output is not valid JSON.'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Only Prompt nodes call a model. This node just shapes the flow.
                  </p>
                )}
              </div>
            ) : (
              <>
                <h2 className="font-semibold mb-3">Workflow</h2>
                <div className="space-y-1">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Select a node on the canvas to edit its prompt and model.
                </p>
              </>
            )}

            {run && (
              <>
                <Separator className="my-4" />
                <h2 className="font-semibold mb-2">
                  Run <Badge variant="outline">{run.status}</Badge>
                </h2>
                <RunStepsList steps={run.steps} />
              </>
            )}

            {!isNew && workflowId && (
              <>
                <Separator className="my-4" />
                <CommentPanel
                  workflowId={workflowId}
                  versionId={latestVersion(existing?.versions)?.id}
                />
              </>
            )}
          </aside>
        </div>
      </div>

      {pendingRun && (
        <RunDialog
          runInputs={getRunInputs(pendingRun.graph)}
          onCancel={() => setPendingRun(null)}
          onConfirm={(payload) => {
            const { workflowId, graph } = pendingRun
            setPendingRun(null)
            submitRun(workflowId, graph, payload)
          }}
        />
      )}

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                rows={3}
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={createTemplate.isPending}>
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function errorMessage(err: unknown): string {
  if (err instanceof GraphValidationError) return err.errors.join(' ')
  if (typeof err === 'object' && err && 'response' in err) {
    const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d) => JSON.stringify(d)).join(', ')
  }
  return err instanceof Error ? err.message : 'Unknown error'
}

function BuilderSkeleton() {
  return (
    <div className="p-8">
      <Skeleton className="h-10 w-64 mb-4" />
      <Skeleton className="h-[60vh]" />
    </div>
  )
}

/**
 * Applies a gallery template once, then hands off to the real builder route.
 *
 * The template id arrives as ?template=<id> from the gallery page. The backend
 * creates the workflow + initial version from the template's stored graph, and
 * this URL is replaced with the new workflow's builder route.
 */
function ApplyTemplate({ templateId }: { templateId: string }) {
  const { workspaceId } = useParams()
  const { organization } = useOrganization()
  const { user } = useUser()
  const navigate = useNavigate()
  const applyTemplate = useApplyTemplate()
  // Guard against effect re-fires (StrictMode double-invokes effects in dev).
  const startedRef = useRef(false)

  const activeId = workspaceId || organization?.id || user?.id
  const ownerId = user?.id

  useEffect(() => {
    if (!activeId || !ownerId || startedRef.current) return
    startedRef.current = true
    applyTemplate
      .mutateAsync({ templateId, workspaceId: activeId, ownerId })
      .then((applied) => {
        toast({ title: 'Template applied', description: applied.name })
        navigate(`/app/w/${activeId}/workflows/${applied.workflow_id}`, { replace: true })
      })
      .catch((err) => {
        toast({
          title: 'Could not apply template',
          description: errorMessage(err),
          variant: 'destructive',
        })
        navigate(`/app/w/${activeId}/workflows/new`, { replace: true })
      })
  }, [activeId, ownerId, templateId, applyTemplate, navigate])

  return <BuilderSkeleton />
}

export function WorkflowBuilderPage() {
  const { workflowId } = useParams()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('template')
  const isNew = workflowId === 'new'
  const { data: existing, isLoading } = useWorkflow(isNew ? undefined : workflowId)

  // 'Use template' in the gallery lands here with ?template=<id>.
  if (isNew && templateId) {
    return <ApplyTemplate templateId={templateId} />
  }

  return (
    <ReactFlowProvider>
      {isLoading && !isNew ? (
        <BuilderSkeleton />
      ) : (
        // Keyed by workflow id: switching workflows remounts the builder with
        // fresh state initialized from the loaded workflow.
        <Builder key={workflowId ?? 'new'} existing={existing ?? null} />
      )}
    </ReactFlowProvider>
  )
}