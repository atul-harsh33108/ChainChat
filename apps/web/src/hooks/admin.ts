import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type { AdminUser, Me, ProGrant } from '@/types'

/** The signed-in user, including their admin flag and Pro entitlement. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v1/users/me')
      return data as Me
    },
    staleTime: 1000 * 60,
  })
}

export function useAdminUsers(query: string) {
  return useQuery({
    queryKey: ['admin', 'users', query],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/v1/admin/users', {
        params: query ? { query } : undefined,
      })
      return data as AdminUser[]
    },
  })
}

export function useUserGrants(clerkId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'grants', clerkId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/api/v1/admin/users/${clerkId}/grants`)
      return data as ProGrant[]
    },
    enabled: !!clerkId,
  })
}

export function useGrantPro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      clerkId,
      days,
      reason,
    }: {
      clerkId: string
      days: number
      reason?: string
    }) => {
      const { data } = await apiClient.post(`/api/v1/admin/users/${clerkId}/pro`, {
        days,
        reason,
      })
      return data as { clerk_id: string; plan: string; pro_expires_at: string }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'grants', vars.clerkId] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useRevokePro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ clerkId }: { clerkId: string }) => {
      const { data } = await apiClient.post(`/api/v1/admin/users/${clerkId}/pro/revoke`)
      return data as { clerk_id: string; plan: string; revoked: number }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'grants', vars.clerkId] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
