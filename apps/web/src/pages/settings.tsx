import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOrganization, useOrganizationList } from '@clerk/clerk-react'
import { useMe } from '@/hooks/admin'
import { useCheckout, usePortal } from '@/hooks/billing'
import { toast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CreditCard, Users, Settings2, Crown } from 'lucide-react'

export function SettingsPage() {
  const { workspaceId } = useParams()
  const { organization } = useOrganization()
  const { createOrganization } = useOrganizationList()
  const activeId = workspaceId || organization?.id

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Workspace settings</h1>

      <Tabs defaultValue="general">
        <TabsList className="mb-6">
          <TabsTrigger value="general">
            <Settings2 className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" />
            Members
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="h-4 w-4 mr-2" />
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Manage your workspace name and identity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium">Name</p>
                <p className="text-sm text-muted-foreground">{organization?.name || 'Personal'}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Workspace ID</p>
                <p className="text-sm text-muted-foreground font-mono">{activeId}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => createOrganization?.({ name: 'New Workspace' })}
              >
                Create workspace
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <MembersTab />
        </TabsContent>

        <TabsContent value="billing">
          <BillingTab activeId={activeId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MembersTab() {
  const { organization, membership, memberships } = useOrganization({
    memberships: { pageSize: 50 },
  })
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  if (!organization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Invite teammates and manage access.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You are in a personal workspace. Invites work in organization workspaces — create one
            from the General tab or the workspace switcher, then come back here to invite your team.
          </p>
        </CardContent>
      </Card>
    )
  }

  const isAdmin = membership?.role === 'org:admin' || membership?.role === 'admin'
  const members = memberships?.data ?? []

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    if (!address) return
    setInviting(true)
    try {
      await organization.inviteMember({ emailAddress: address, role: 'org:member' })
      toast({ title: 'Invitation sent', description: address })
      setEmail('')
    } catch (err) {
      toast({ title: 'Invite failed', description: message(err), variant: 'destructive' })
    } finally {
      setInviting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>People with access to {organization.name}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {memberships?.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
              >
                <span className="truncate">
                  {m.publicUserData?.firstName || m.publicUserData?.identifier}
                </span>
                <Badge
                  variant={m.role === 'org:admin' || m.role === 'admin' ? 'default' : 'secondary'}
                >
                  {m.role === 'org:admin' || m.role === 'admin' ? 'Admin' : 'Member'}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {isAdmin ? (
          <form onSubmit={handleInvite} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="invite-email">Invite by email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={inviting || !email.trim()}>
              {inviting ? 'Inviting…' : 'Invite'}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only organization admins can invite members.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function BillingTab({ activeId }: { activeId: string | undefined }) {
  const { data: me } = useMe()
  const checkout = useCheckout()
  const portal = usePortal()

  const handleUpgrade = async () => {
    if (!activeId) return
    try {
      const session = await checkout.mutateAsync({
        workspaceId: activeId,
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      })
      if (session.session_id === 'cs_placeholder') {
        toast({
          title: 'Billing is in placeholder mode',
          description:
            'Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID on the billing service to enable real checkout.',
        })
        return
      }
      window.location.assign(session.url)
    } catch (err) {
      toast({ title: 'Checkout failed', description: message(err), variant: 'destructive' })
    }
  }

  const handlePortal = async () => {
    if (!activeId) return
    try {
      const { url } = await portal.mutateAsync({
        workspaceId: activeId,
        returnUrl: window.location.href,
      })
      // Placeholder mode echoes the return URL back unchanged.
      if (url === window.location.href) {
        toast({
          title: 'Billing is in placeholder mode',
          description:
            'Configure Stripe keys on the billing service to enable the customer portal.',
        })
        return
      }
      window.location.assign(url)
    } catch (err) {
      toast({ title: 'Portal unavailable', description: message(err), variant: 'destructive' })
    }
  }

  const busy = checkout.isPending || portal.isPending
  const isPro = me?.plan === 'pro'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Billing
          {me && (
            <Badge variant={isPro ? 'default' : 'secondary'}>
              {isPro ? (
                <>
                  <Crown className="h-3 w-3 mr-1" />
                  Pro
                </>
              ) : (
                'Free'
              )}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>$12/month per team. Manage your subscription.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPro && me?.pro_expires_at && (
          <p className="text-sm text-muted-foreground">
            Pro access active until {new Date(me.pro_expires_at).toLocaleString()}.
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={handleUpgrade} disabled={busy || !activeId || isPro}>
            {checkout.isPending ? 'Opening checkout…' : isPro ? 'Pro active' : 'Upgrade to Pro'}
          </Button>
          <Button variant="outline" onClick={handlePortal} disabled={busy || !activeId}>
            Customer portal
          </Button>
        </div>
      </CardContent>
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
