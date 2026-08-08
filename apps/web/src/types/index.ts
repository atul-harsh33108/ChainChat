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

/** Response of GET /api/v1/users/me. */
export interface Me {
  id: string
  clerk_id: string
  email: string
  name: string | null
  avatar_url: string | null
  created_at: string
  is_admin: boolean
  plan: 'free' | 'pro'
  pro_expires_at: string | null
}

/** A Clerk user merged with local entitlement state (admin console). */
export interface AdminUser {
  clerk_id: string
  email: string | null
  name: string | null
  avatar_url: string | null
  created_at: string | null
  last_sign_in_at: string | null
  is_admin: boolean
  plan: 'free' | 'pro'
  pro_expires_at: string | null
}

export interface ProGrant {
  id: string
  clerk_id: string
  granted_by: string
  reason: string | null
  starts_at: string
  expires_at: string
  revoked_at: string | null
  revoked_by: string | null
  created_at: string
}

export type NodeType = 'start' | 'prompt' | 'decision' | 'output'

export type RunInputFieldType = 'text' | 'textarea' | 'number' | 'select'

/** Stored inside a Start_Node's NodeConfig.runInputs, in declaration order. */
export interface RunInputDef {
  key: string // Run_Input_Key: ^[A-Za-z_][A-Za-z0-9_]*$, <= 64 chars
  label: string // <= 200 chars
  fieldType: RunInputFieldType
  required: boolean // defaults to false when absent
  defaultValue?: string | number
  helpText?: string // <= 500 chars
  placeholder?: string // <= 200 chars
  options?: string[] // required + 1..100 unique entries iff fieldType === 'select'
}

/** How an Output_Node's engine step reformats its single upstream
 * dependency's text (services/execution-service's ``format`` step field). */
export type OutputDisplayFormat = 'text' | 'markdown' | 'json'

export interface NodeConfig {
  /** OpenRouter model id, e.g. "google/gemma-4-31b-it:free". */
  model?: string
  prompt?: string
  temperature?: number
  /** Start_Node only. Declared Run_Inputs, in author-defined order. */
  runInputs?: RunInputDef[]
  /** Prompt_Node only. Overrides the toStepKey(node.id)-derived key. */
  stepKey?: string
  /** Output_Node only. Defaults to 'text' when unset. */
  displayFormat?: OutputDisplayFormat
}

export interface GraphNode {
  id: string
  type: NodeType
  label?: string
  position: { x: number; y: number }
  config?: NodeConfig
}

/** Op supported by the execution engine's condition evaluator (services/execution-service). */
export type EdgeConditionOp = 'contains' | 'equals' | 'not_empty'

/**
 * A branch condition on an edge leaving a Decision_Node. Evaluated against
 * the rendered text output of `sourceStep` (an upstream Prompt node's
 * Step_Reference_Key, resolved at compile time by `graphToSteps`). Absent on
 * edges that aren't leaving a decision node -- those are unconditional.
 */
export interface EdgeCondition {
  op: EdgeConditionOp
  /** Required for 'contains' and 'equals'; unused for 'not_empty'. */
  value?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
  /** Only meaningful when `source` is a Decision_Node. */
  condition?: EdgeCondition
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

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** A step's outputs. `json`/`format_error` are only ever set by a "format"
 * step (Output_Node) whose `format` is `'json'` -- see `_format_output` in
 * services/execution-service. */
export interface StepOutputs {
  text?: string
  json?: unknown
  format_error?: string
}

export interface ExecutionStep {
  id: string
  execution_id: string
  step_key: string
  depends_on: string[]
  conditions: { source_step: string; op: EdgeConditionOp; value?: string }[] | null
  /** "prompt" (default, calls an AI provider) or "format" (Output_Node;
   * reformats a single upstream step's output, no provider call). */
  step_type: 'prompt' | 'format'
  format: OutputDisplayFormat | null
  provider: string
  model_key: string
  prompt: string | null
  inputs: Record<string, unknown> | null
  outputs: StepOutputs | null
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
    outputs: StepOutputs | null
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
