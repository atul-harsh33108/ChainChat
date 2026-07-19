import { useParams } from 'react-router-dom'
import { useOrganization, useOrganizationList } from '@clerk/clerk-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CreditCard, Users, Settings2 } from 'lucide-react'

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
          <TabsTrigger value="general"><Settings2 className="h-4 w-4 mr-2" />General</TabsTrigger>
          <TabsTrigger value="members"><Users className="h-4 w-4 mr-2" />Members</TabsTrigger>
          <TabsTrigger value="billing"><CreditCard className="h-4 w-4 mr-2" />Billing</TabsTrigger>
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
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>Invite teammates and manage access.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Member management is handled through Clerk. Use the Clerk dashboard to invite users to this organization.
              </p>
              <Button className="mt-4" onClick={() => alert('Open Clerk dashboard to invite members')}>
                Invite members
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Billing
                <Badge>Pro trial</Badge>
              </CardTitle>
              <CardDescription>$12/month per team. Manage your subscription.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Stripe billing is connected in production. In development, billing endpoints return placeholder data.
              </p>
              <div className="flex gap-2">
                <Button>Upgrade to Pro</Button>
                <Button variant="outline">Customer portal</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
