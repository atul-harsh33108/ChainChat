export interface User {
  id: string
  clerkId: string
  email: string
  name: string | null
  avatarUrl: string | null
}

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

export interface WorkflowVariable {
  name: string
  type: 'string' | 'number' | 'boolean'
  default?: string
  required: boolean
}

export interface WorkflowNode {
  id: string
  type: 'start' | 'prompt' | 'decision' | 'output'
  position: { x: number; y: number }
  label?: string
  config?: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
  condition?: string
}

export interface Workflow {
  id: string
  workspaceId: string
  createdBy: string
  name: string
  description: string | null
  isPublic: boolean
  sourceWorkflowId: string | null
  variables: WorkflowVariable[]
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  version: number
  createdAt: string
  updatedAt: string
}

export interface ExecutionStep {
  id: string
  nodeId: string
  nodeType: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  inputSnapshot: Record<string, unknown>
  outputSnapshot: Record<string, unknown>
  errorMessage: string | null
  latencyMs: number
  costEstimateUsd: number | null
}

export interface Execution {
  id: string
  workflowId: string
  workspaceId: string
  triggeredBy: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  inputContext: Record<string, unknown>
  outputContext: Record<string, unknown>
  startedAt: string | null
  finishedAt: string | null
  costEstimateUsd: number | null
  latencyMs: number | null
  steps: ExecutionStep[]
}

export interface Template {
  id: string
  name: string
  description: string | null
  category: string
  workflowSnapshot: Omit<Workflow, 'id' | 'workspaceId' | 'createdBy' | 'version' | 'createdAt' | 'updatedAt'>
  isOfficial: boolean
}
