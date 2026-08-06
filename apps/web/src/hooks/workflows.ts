import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { graphToSteps } from '@/lib/graph'
import type { Execution, Template, Workflow, WorkflowGraph, WorkflowVersion } from '@/types'

export function useWorkflows(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workflows', workspaceId],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v1/workflows', {
        params: { workspace_id: workspaceId },
      })
      return data as Workflow[]
    },
    enabled: !!workspaceId,
  })
}

export function useWorkflow(workflowId: string | undefined) {
  return useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/v1/workflows/${workflowId}`)
      return data as Workflow
    },
    enabled: !!workflowId,
  })
}

export function useCreateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      workspace_id: string
      name: string
      description?: string
      metadata?: Record<string, unknown>
    }) => {
      const { data } = await apiClient.post('/api/v1/workflows', payload)
      return data as Workflow
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workflows', data.workspace_id] })
    },
  })
}

export function useUpdateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string
      name?: string
      description?: string
      metadata?: Record<string, unknown>
      published_version_id?: string
    }) => {
      const { data } = await apiClient.patch(`/api/v1/workflows/${id}`, payload)
      return data as Workflow
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workflow', data.id] })
      qc.invalidateQueries({ queryKey: ['workflows', data.workspace_id] })
    },
  })
}

/**
 * The graph is persisted as a new immutable workflow version, which is how the
 * backend models workflow content (version_number is assigned server-side).
 */
export function useCreateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      workflowId,
      graph,
      changeSummary,
    }: {
      workflowId: string
      graph: WorkflowGraph
      changeSummary?: string
    }) => {
      const { data } = await apiClient.post(`/api/v1/workflows/${workflowId}/versions`, {
        graph,
        status: 'draft',
        change_summary: changeSummary,
      })
      return data as WorkflowVersion
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workflow', data.workflow_id] })
    },
  })
}

export function useForkWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      workflowId,
      targetWorkspaceId,
      newName,
    }: {
      workflowId: string
      targetWorkspaceId: string
      newName?: string
    }) => {
      const { data } = await apiClient.post(`/api/v1/workflows/${workflowId}/fork`, {
        target_workspace_id: targetWorkspaceId,
        new_name: newName,
      })
      return data as { id: string; name: string; parent_id: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
    },
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v1/templates')
      return data as Template[]
    },
  })
}

/** Runs of a single workflow (executions are keyed by chain_id = workflow id). */
export function useExecutions(workflowId: string | undefined) {
  return useQuery({
    queryKey: ['executions', workflowId],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v1/executions', {
        params: { chain_id: workflowId },
      })
      return data as Execution[]
    },
    enabled: !!workflowId,
  })
}

/**
 * Poll a single execution until it reaches a terminal state.
 *
 * Polling rather than the SSE endpoint: EventSource cannot send an
 * Authorization header, so a stream through the gateway would be rejected.
 */
export function useExecution(executionId: string | undefined) {
  return useQuery({
    queryKey: ['execution', executionId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/v1/executions/${executionId}`)
      return data as Execution
    },
    enabled: !!executionId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'pending' || status === 'running' ? 1500 : false
    },
  })
}

export class GraphValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join(' '))
    this.name = 'GraphValidationError'
  }
}

export function useRunWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      workspaceId,
      workflowId,
      graph,
      inputPayload,
    }: {
      workspaceId: string
      workflowId: string
      graph: WorkflowGraph
      inputPayload?: Record<string, unknown>
    }) => {
      const { steps, errors } = graphToSteps(graph)
      if (errors.length) throw new GraphValidationError(errors)

      const { data } = await apiClient.post('/api/v1/executions', {
        workspace_id: workspaceId,
        chain_id: workflowId,
        input_payload: inputPayload || {},
        steps,
      })
      return data as Execution
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['executions', data.chain_id] })
    },
  })
}
