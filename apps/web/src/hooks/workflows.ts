import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type { Workflow, Template, Execution } from '@/types'

export function useWorkflows(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workflows', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return []
      const { data } = await apiClient.get(`/api/v1/workflows?workspace_id=${workspaceId}`)
      return data as Workflow[]
    },
    enabled: !!workspaceId,
  })
}

export function useWorkflow(workflowId: string | undefined) {
  return useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: async () => {
      if (!workflowId) return null
      const { data } = await apiClient.get(`/api/v1/workflows/${workflowId}`)
      return data as Workflow
    },
    enabled: !!workflowId,
  })
}

export function useCreateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Partial<Workflow>) => {
      const { data } = await apiClient.post('/api/v1/workflows', payload)
      return data as Workflow
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['workflows', vars.workspaceId] })
    },
  })
}

export function useUpdateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Workflow> & { id: string }) => {
      const { data } = await apiClient.patch(`/api/v1/workflows/${id}`, payload)
      return data as Workflow
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['workflow', data.id] })
      qc.invalidateQueries({ queryKey: ['workflows', data.workspaceId] })
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

export function useExecutions(workflowId: string | undefined) {
  return useQuery({
    queryKey: ['executions', workflowId],
    queryFn: async () => {
      if (!workflowId) return []
      const { data } = await apiClient.get(`/api/v1/executions?workflow_id=${workflowId}`)
      return data as Execution[]
    },
    enabled: !!workflowId,
  })
}

export function useRunWorkflow() {
  return useMutation({
    mutationFn: async ({
      workflowId,
      inputContext,
    }: {
      workflowId: string
      inputContext: Record<string, unknown>
    }) => {
      const { data } = await apiClient.post('/api/v1/executions', {
        workflow_id: workflowId,
        input_context: inputContext,
      })
      return data as Execution
    },
  })
}
