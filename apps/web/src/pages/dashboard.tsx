import { Link, useParams } from 'react-router-dom'
import { useOrganization, useUser } from '@clerk/clerk-react'
import { useMe } from '@/hooks/admin'
import { useWorkflows } from '@/hooks/workflows'
import { latestVersion } from '@/lib/graph'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Workflow, Users, CreditCard, ArrowRight, Crown, Plus } from 'lucide-react'

export function DashboardPage() {
  const { organization, isLoaded } = useOrganization()
  const { user } = useUser()
  const { workspaceId } = useParams()

  // Organizations can be disabled on the Clerk instance; fall back to the
  // route param and finally the user's own id (personal workspace).
  const activeId = workspaceId || organization?.id || user?.id

  const { data: me } = useMe()
  const { data: workflows, isLoading: workflowsLoading } = useWorkflows(activeId)

  if (!isLoaded) return <DashboardSkeleton />

  const recent = [...(workflows ?? [])]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)

  return (
    <div className="page-shell">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="section-label mb-2">Dashboard</p>
          <h1 className="page-title">{organization?.name || 'My workspace'}</h1>
          <p className="page-subtitle">Manage your team’s AI workflows.</p>
        </div>
        {me && (
          <Badge variant={me.plan === 'pro' ? 'default' : 'secondary'} className="mt-1">
            {me.plan === 'pro' ? (
              <>
                <Crown className="mr-1 h-3 w-3" />
                Pro
              </>
            ) : (
              'Free plan'
            )}
          </Badge>
        )}
      </div>

      <div className="mb-10 grid gap-4 md:grid-cols-3">
        <QuickLink
          to={`/app/w/${activeId}/workflows`}
          icon={<Workflow className="h-5 w-5" />}
          title="Workflows"
          description="Build and run prompt chains."
        />
        <QuickLink
          to={`/app/w/${activeId}/settings`}
          icon={<Users className="h-5 w-5" />}
          title="Members"
          description="Invite teammates and manage roles."
        />
        <QuickLink
          to={`/app/w/${activeId}/settings`}
          icon={<CreditCard className="h-5 w-5" />}
          title="Billing"
          description="$12/month per team. Upgrade anytime."
        />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Recent workflows</h2>
          <p className="text-sm text-muted-foreground">Pick up where you left off.</p>
        </div>
        <Link to={`/app/w/${activeId}/workflows/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create workflow
          </Button>
        </Link>
      </div>

      {workflowsLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : recent.length ? (
        <div className="mt-4 grid gap-3">
          {recent.map((wf) => {
            const version = latestVersion(wf.versions)
            return (
              <Link key={wf.id} to={`/app/w/${activeId}/workflows/${wf.id}`}>
                <Card className="hover:-translate-y-0.5 hover:shadow-lift">
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base">{wf.name}</CardTitle>
                      {version && <Badge variant="outline">v{version.version_number}</Badge>}
                    </div>
                    <CardDescription>
                      Updated {new Date(wf.updated_at).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        <Card className="mt-4 border-dashed">
          <CardContent className="py-14 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Workflow className="h-5 w-5" />
            </div>
            <p className="font-display text-lg font-semibold tracking-tight">No workflows yet</p>
            <CardDescription className="mx-auto mt-1 max-w-sm">
              Create your first AI prompt chain and share it with the team.
            </CardDescription>
            <Link to={`/app/w/${activeId}/workflows/new`}>
              <Button className="mt-5">
                <Plus className="mr-2 h-4 w-4" />
                Create workflow
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function QuickLink({
  to,
  icon,
  title,
  description,
}: {
  to: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link to={to}>
      <Card className="group h-full hover:-translate-y-0.5 hover:shadow-lift">
        <CardHeader className="pb-2">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            {icon}
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-4 flex items-center text-sm font-semibold text-primary">
            Open <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function DashboardSkeleton() {
  return (
    <div className="page-shell space-y-6">
      <Skeleton className="h-10 w-64 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  )
}
