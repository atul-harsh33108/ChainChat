import { useUser } from '@clerk/clerk-react'
import { Badge } from '@/components/ui/badge'

/**
 * Shows how many collaborators are currently viewing/editing a workflow.
 * Presence is sourced from the collaboration stream (Redis-backed).
 */
export function PresenceIndicator({ users }: { users: string[] }) {
  const { user } = useUser()
  const others = users.filter((id) => id !== user?.id)

  if (others.length === 0) return null

  return (
    <Badge
      variant="outline"
      className="gap-1"
      title={`${others.length} collaborator${others.length === 1 ? '' : 's'} viewing this workflow`}
    >
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      {others.length} online
    </Badge>
  )
}