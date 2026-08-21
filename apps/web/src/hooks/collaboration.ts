import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/lib/api'
import type { GraphChange, PresenceState } from '@/types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function authToken(): string | null {
  return localStorage.getItem('clerk-token')
}

/**
 * Subscribe to a workflow's collaboration stream (presence + graph changes).
 *
 * Uses fetch-based streaming rather than EventSource because the gateway
 * requires an Authorization header, which EventSource cannot send.
 */
export function useCollaborationStream(workflowId: string | undefined) {
  const [presence, setPresence] = useState<string[]>([])
  const [lastChange, setLastChange] = useState<GraphChange | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!workflowId) return

    const controller = new AbortController()
    abortRef.current = controller

    const stream = async () => {
      const token = authToken()
      if (!token) return

      try {
        const resp = await fetch(
          `${API_URL}/api/v1/workflows/${workflowId}/collab/stream`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        )
        if (!resp.body) return

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // SSE frames are separated by a blank line.
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''

          for (const frame of frames) {
            const eventLine = frame
              .split('\n')
              .find((l) => l.startsWith('event:'))
            const dataLine = frame
              .split('\n')
              .find((l) => l.startsWith('data:'))
            if (!dataLine) continue

            const event = eventLine?.replace('event:', '').trim()
            const raw = dataLine.replace('data:', '').trim()
            if (!raw) continue

            try {
              const data = JSON.parse(raw)
              if (event === 'presence') {
                setPresence((data as PresenceState).users ?? [])
              } else if (event === 'change') {
                setLastChange(data as GraphChange)
              }
            } catch {
              // Ignore malformed frames.
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // Stream ended unexpectedly; the effect will not retry automatically.
        }
      }
    }

    stream()

    return () => {
      controller.abort()
      abortRef.current = null
    }
  }, [workflowId])

  return { presence, lastChange }
}

/** Send a heartbeat to keep the caller in the workflow's presence set. */
export function usePresenceHeartbeat(workflowId: string | undefined) {
  useEffect(() => {
    if (!workflowId) return

    const beat = () => {
      apiClient
        .post(`/api/v1/workflows/${workflowId}/collab/heartbeat`)
        .catch(() => {})
    }

    beat()
    const id = setInterval(beat, 15_000)
    return () => clearInterval(id)
  }, [workflowId])
}

/** Apply a graph change to the workflow and broadcast it to collaborators. */
export function useApplyGraphChange(workflowId: string | undefined) {
  return useCallback(
    async (change: GraphChange) => {
      if (!workflowId) return
      await apiClient.post(`/api/v1/workflows/${workflowId}/collab/changes`, change)
    },
    [workflowId]
  )
}