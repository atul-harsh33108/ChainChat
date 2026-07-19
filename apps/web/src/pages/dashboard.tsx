import { Link } from 'react-router-dom'
import { useOrganization } from '@clerk/clerk-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Workflow, Users, CreditCard, ArrowRight } from 'lucide-react'

export function DashboardPage() {
  const { organization, isLoaded } = useOrganization()

  if (!isLoaded) {
    return <DashboardSkeleton />
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{organization?.name || 'Workspace'}</h1>
          <p className="text-muted-foreground">Manage your team's AI workflows.</p>
        </div>
        <Badge variant="secondary">Pro trial</Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Link to={`/app/w/${organization?.id}/workflows`}>
          <Card className="hover:bg-accent/50 transition-colors">
            <CardHeader className="pb-2">
              <Workflow className="h-5 w-5 mb-2" />
              <CardTitle className="text-base">Workflows</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Build and run prompt chains.</p>
              <div className="mt-4 flex items-center text-sm font-medium">
                Open <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to={`/app/w/${organization?.id}/settings`}>
          <Card className="hover:bg-accent/50 transition-colors">
            <CardHeader className="pb-2">
              <Users className="h-5 w-5 mb-2" />
              <CardTitle className="text-base">Members</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Invite teammates and manage roles.</p>
              <div className="mt-4 flex items-center text-sm font-medium">
                Open <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to={`/app/w/${organization?.id}/settings`}>
          <Card className="hover:bg-accent/50 transition-colors">
            <CardHeader className="pb-2">
              <CreditCard className="h-5 w-5 mb-2" />
              <CardTitle className="text-base">Billing</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">$12/month per team. Upgrade anytime.</p>
              <div className="mt-4 flex items-center text-sm font-medium">
                Open <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recent workflows</h2>
        <Link to={`/app/w/${organization?.id}/workflows/new`}>
          <Button>Create workflow</Button>
        </Link>
      </div>
      <Card className="mt-4">
        <CardContent className="py-12 text-center">
          <CardDescription>No workflows yet. Create your first AI prompt chain.</CardDescription>
          <Link to={`/app/w/${organization?.id}/workflows/new`}>
            <Button className="mt-4">Create workflow</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="p-8 max-w-5xl space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid md:grid-cols-3 gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-48" />
    </div>
  )
}
