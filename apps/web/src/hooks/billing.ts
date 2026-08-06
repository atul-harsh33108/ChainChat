import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'

/**
 * Creates a Stripe Checkout session. When Stripe keys are not configured the
 * backend returns a placeholder (`session_id: "cs_placeholder"`), which the
 * caller surfaces as a toast instead of redirecting.
 */
export function useCheckout() {
  return useMutation({
    mutationFn: async (payload: { workspaceId: string; successUrl: string; cancelUrl: string }) => {
      const { data } = await apiClient.post('/api/v1/billing/checkout', {
        workspace_id: payload.workspaceId,
        success_url: payload.successUrl,
        cancel_url: payload.cancelUrl,
      })
      return data as { session_id: string; url: string }
    },
  })
}

/**
 * Opens the Stripe customer portal. In placeholder mode the backend echoes the
 * return URL back unchanged, which the caller uses to detect the placeholder.
 */
export function usePortal() {
  return useMutation({
    mutationFn: async (payload: { workspaceId: string; returnUrl: string }) => {
      const { data } = await apiClient.post('/api/v1/billing/portal', {
        workspace_id: payload.workspaceId,
        return_url: payload.returnUrl,
      })
      return data as { url: string }
    },
  })
}
