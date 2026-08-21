import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type { Comment } from '@/types'

export function useComments(workflowId: string | undefined) {
  return useQuery({
    queryKey: ['comments', workflowId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/v1/workflows/${workflowId}/comments`)
      return data as Comment[]
    },
    enabled: !!workflowId,
  })
}

export function useCreateComment(workflowId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      content,
      versionId,
    }: {
      content: string
      versionId?: string
    }) => {
      const { data } = await apiClient.post(
        `/api/v1/workflows/${workflowId}/comments`,
        { content, version_id: versionId }
      )
      return data as Comment
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', workflowId] })
    },
  })
}

export function useDeleteComment(workflowId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/api/v1/workflows/${workflowId}/comments/${commentId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', workflowId] })
    },
  })
}