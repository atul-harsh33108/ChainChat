import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Workspace } from '@/types'

interface WorkspaceState {
  currentWorkspaceId: string | null
  setCurrentWorkspace: (workspace: Workspace | null) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      setCurrentWorkspace: (workspace) =>
        set({ currentWorkspaceId: workspace?.id || null }),
    }),
    { name: 'chainchat-workspace' }
  )
)
