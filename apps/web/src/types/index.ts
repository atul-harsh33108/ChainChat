export interface User {
  id: string
  clerkId: string
  email: string
  name: string | null
  avatarUrl: string | null
}

/** UI-only view of the active workspace (sourced from Clerk, not the API). */
export interface Workspace {
  id: string
  name: string
  slug: string
  plan: 'free' | 'pro'
  subscriptionStatus: string
  role: 'owner' | 'editor' | 'viewer'
}

export interface Membership {
  userId: string
  workspaceId: string
  role: 'owner' | 'editor' | 'viewer'
  user?: User
}

export type NodeType = 'start' | 'prompt' | 'decision' | 'output'

export interface NodeConfig {
  /** OpenRouter model id, e.g. "google/gemma-4-31b-it:free". */
  model?: string
  prompt?: string
  temperature?: number
}

export interface GraphNode {
  id: string
  type: NodeType
  label?: string
  position: { x: number; y: number }
  config?: NodeConfig
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

/** Stored verbatim in WorkflowVersion.graph (JSONB) on the backend. */
export interface WorkflowGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface WorkflowVersion {
  id: string
  workflow_id: string
  version_number: number
  name: string | null
  description: string | null
  change_summary: string | null
  status: string
  graph: WorkflowGraph | null
  metadata: Record<string, unknown> | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Workflow {
  id: string
  workspace_id: string
  owner_id: string
  name: string
  description: string | null
  metadata: Record<string, unknown> | null
  is_template: boolean
  parent_id: string | null
  root_version_id: string | null
  published_version_id: string | null
  created_at: string
  updated_at: string
  versions: WorkflowVersion[]
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed'
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ExecutionStep {
  id: string
  execution_id: string
  step_key: string
  depends_on: string[]
  provider: string
  model_key: string
  prompt: string | null
  inputs: Record<string, unknown> | null
  outputs: { text?: string } | null
  status: StepStatus
  retry_count: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface Execution {
  id: string
  workspace_id: string
  /** The workflow this run belongs to. */
  chain_id: string
  status: ExecutionStatus
  input_payload: Record<string, unknown> | null
  output_payload: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
  steps: ExecutionStep[]
}

/** Lightweight payload pushed by the /executions/{id}/stream SSE endpoint. */
export interface ExecutionStreamEvent {
  id: string
  status: ExecutionStatus
  steps: {
    step_key: string
    status: StepStatus
    retry_count: number
    outputs: { text?: string } | null
    error_message: string | null
  }[]
}

export interface Template {
  id: string
  source_workflow_id: string | null
  name: string
  description: string | null
  category: string | null
  tags: string[] | null
  graph: WorkflowGraph | null
  metadata: Record<string, unknown> | null
  is_public: boolean
  created_by: string
  created_at: string
  updated_at: string
}
