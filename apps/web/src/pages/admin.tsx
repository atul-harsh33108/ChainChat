import { useState } from 'react'
import { useAdminUsers, useGrantPro, useMe, useRevokePro, useUserGrants } from '@/hooks/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import type { AdminUser } from '@/types'
import { ShieldCheck, Search, Crown, XCircle } from 'lucide-react'

const DURATIONS = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
]

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function daysLeft(value: string | null, now: number): number | null {
  if (!value) return null
  const ms = new Date(value).getTime() - now
  return ms <= 0 ? 0 : Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function AdminPage() {
  const { data: me, isLoading: meLoading } = useMe()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  // dataUpdatedAt doubles as a pure 'now' for expiry math; Date.now() during
  // render trips react-hooks/purity.
  const { data: users, isLoading, isError, error, dataUpdatedAt } = useAdminUsers(query)
  const [selected, setSelected] = useState<AdminUser | null>(null)

  if (meLoading) {
    return (
      <div className="p-8 max-w-5xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  // Server-side authorization is authoritative; this only hides the UI.
  if (!me?.is_admin) {
    return (
      <div className="p-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Administrator access required</CardTitle>
            <CardDescription>
              Your account ({me?.email}) is not on the admin list. Add it to ADMIN_EMAILS and
              restart the auth service to gain access.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Admin console</h1>
      </div>
      <p className="text-muted-foreground mb-6">Manage users and grant time-limited Pro access.</p>

      <form
        className="flex items-end gap-2 mb-6"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(search.trim())
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="user-search">Search users</Label>
          <Input
            id="user-search"
            placeholder="Email, name, or user id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          <Search className="h-4 w-4 mr-2" />
          Search
        </Button>
      </form>

      {isError && (
        <Card className="mb-6 border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            Could not load users: {error instanceof Error ? error.message : 'Unknown error'}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : users?.length ? (
        <div className="space-y-3">
          {users.map((user) => (
            <UserRow
              key={user.clerk_id}
              user={user}
              expanded={selected?.clerk_id === user.clerk_id}
              now={dataUpdatedAt}
              onToggle={() => setSelected(selected?.clerk_id === user.clerk_id ? null : user)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <CardDescription>No users found.</CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function UserRow({
  user,
  expanded,
  now,
  onToggle,
}: {
  user: AdminUser
  expanded: boolean
  now: number
  onToggle: () => void
}) {
  const [days, setDays] = useState('30')
  const [reason, setReason] = useState('')
  const grant = useGrantPro()
  const revoke = useRevokePro()
  const { data: grants } = useUserGrants(expanded ? user.clerk_id : undefined)

  const remaining = daysLeft(user.pro_expires_at, now)

  const handleGrant = async () => {
    try {
      const result = await grant.mutateAsync({
        clerkId: user.clerk_id,
        days: Number(days),
        reason: reason.trim() || undefined,
      })
      toast({
        title: 'Pro access granted',
        description: `Expires ${new Date(result.pro_expires_at).toLocaleString()}`,
      })
      setReason('')
    } catch (err) {
      toast({ title: 'Grant failed', description: message(err), variant: 'destructive' })
    }
  }

  const handleRevoke = async () => {
    try {
      const result = await revoke.mutateAsync({ clerkId: user.clerk_id })
      toast({
        title: result.revoked ? 'Pro access revoked' : 'Nothing to revoke',
        description: `${result.revoked} grant(s) revoked`,
      })
    } catch (err) {
      toast({ title: 'Revoke failed', description: message(err), variant: 'destructive' })
    }
  }

  const busy = grant.isPending || revoke.isPending

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="truncate">{user.name || user.email || user.clerk_id}</span>
              {user.is_admin && <Badge variant="outline">Admin</Badge>}
              {user.plan === 'pro' ? (
                <Badge>
                  <Crown className="h-3 w-3 mr-1" />
                  Pro
                </Badge>
              ) : (
                <Badge variant="secondary">Free</Badge>
              )}
            </CardTitle>
            <CardDescription className="truncate">{user.email}</CardDescription>
            <p className="mt-1 text-xs text-muted-foreground font-mono truncate">{user.clerk_id}</p>
          </div>
          <div className="text-right shrink-0">
            {user.plan === 'pro' && (
              <p className="text-xs text-muted-foreground">
                {remaining} day{remaining === 1 ? '' : 's'} left
                <br />
                until {formatDate(user.pro_expires_at)}
              </p>
            )}
            <Button variant="ghost" size="sm" className="mt-1" onClick={onToggle}>
              {expanded ? 'Close' : 'Manage'}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <Separator />
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`days-${user.clerk_id}`}>Duration</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger id={`days-${user.clerk_id}`} className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px] space-y-1">
              <Label htmlFor={`reason-${user.clerk_id}`}>Reason (optional)</Label>
              <Input
                id={`reason-${user.clerk_id}`}
                placeholder="e.g. beta tester"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button onClick={handleGrant} disabled={busy}>
              <Crown className="h-4 w-4 mr-2" />
              {user.plan === 'pro' ? 'Extend Pro' : 'Grant Pro'}
            </Button>
            <Button variant="outline" onClick={handleRevoke} disabled={busy || user.plan !== 'pro'}>
              <XCircle className="h-4 w-4 mr-2" />
              Revoke
            </Button>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Grant history</h3>
            {grants?.length ? (
              <div className="space-y-1">
                {grants.map((g) => {
                  const revoked = !!g.revoked_at
                  const expired = new Date(g.expires_at).getTime() <= now
                  return (
                    <div
                      key={g.id}
                      className="flex items-center justify-between rounded border px-2 py-1 text-xs"
                    >
                      <span>
                        {formatDate(g.starts_at)} → {formatDate(g.expires_at)}
                        {g.reason && ` · ${g.reason}`}
                      </span>
                      <Badge variant={revoked || expired ? 'secondary' : 'default'}>
                        {revoked ? 'revoked' : expired ? 'expired' : 'active'}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No grants yet.</p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function message(err: unknown): string {
  if (typeof err === 'object' && err && 'response' in err) {
    const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
    if (typeof detail === 'string') return detail
  }
  return err instanceof Error ? err.message : 'Unknown error'
}
