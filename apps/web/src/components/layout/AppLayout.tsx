import { Outlet, useParams, Link, useLocation } from 'react-router-dom'
import { useUser, useOrganizationList, useOrganization } from '@clerk/clerk-react'
import { useEffect } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useWorkspaceStore } from '@/stores/workspace'
import { useMe } from '@/hooks/admin'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/brand/Logo'
import {
  LayoutDashboard,
  FileText,
  Settings,
  ChevronDown,
  ShieldCheck,
  Crown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const { user } = useUser()
  const orgListResult = useOrganizationList()
  const organizationList = (
    orgListResult as {
      organizationList?: { organization: { id: string; name: string }; role: string }[]
    }
  ).organizationList
  const setActive = orgListResult.setActive
  const { organization } = useOrganization()
  const { workspaceId } = useParams()
  const { currentWorkspaceId, setCurrentWorkspace } = useWorkspaceStore()
  const location = useLocation()
  const { data: me } = useMe()

  useEffect(() => {
    if (organization) {
      setCurrentWorkspace({
        id: organization.id,
        name: organization.name,
        slug: organization.slug || organization.id,
        plan: 'free',
        subscriptionStatus: 'active',
        role: membershipRole(organizationList, organization.id),
      })
    }
  }, [organization, organizationList, setCurrentWorkspace])

  // Organizations may be disabled on the Clerk instance, in which case there is
  // no organization to act as the workspace. Fall back to the user's own id so
  // the app still has a stable workspace identifier ("personal workspace").
  const activeId = workspaceId || currentWorkspaceId || organization?.id || user?.id

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="flex w-[15.5rem] flex-col border-r border-border/70 bg-card/60 backdrop-blur-sm">
        <div className="space-y-4 p-4">
          <Link to={`/app/w/${activeId}`} className="inline-flex">
            <Logo size="sm" />
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-10 w-full justify-between rounded-xl border-border/80 bg-background/60 font-medium"
              >
                <span className="truncate">{organization?.name || 'Personal'}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-xl" align="start">
              {(organizationList || []).map(
                (item: { organization: { id: string; name: string } }) => (
                  <DropdownMenuItem
                    key={item.organization.id}
                    onClick={() => setActive?.({ organization: item.organization.id })}
                  >
                    {item.organization.name}
                  </DropdownMenuItem>
                )
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={`/app/w/${activeId}/settings`}>Create workspace</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Separator className="opacity-70" />

        <nav className="flex-1 space-y-1 p-3">
          <p className="section-label mb-2 px-3">Workspace</p>
          <NavItem
            to={`/app/w/${activeId}`}
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Dashboard"
            active={
              location.pathname === `/app/w/${activeId}` || location.pathname === '/app'
            }
          />
          <NavItem
            to={`/app/w/${activeId}/workflows`}
            icon={<FileText className="h-4 w-4" />}
            label="Workflows"
            active={location.pathname.startsWith(`/app/w/${activeId}/workflows`)}
          />
          <NavItem
            to={`/app/w/${activeId}/settings`}
            icon={<Settings className="h-4 w-4" />}
            label="Settings"
            active={location.pathname === `/app/w/${activeId}/settings`}
          />
          {me?.is_admin && (
            <>
              <p className="section-label mb-2 mt-5 px-3">System</p>
              <NavItem
                to="/app/admin"
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Admin"
                active={location.pathname === '/app/admin'}
              />
            </>
          )}
        </nav>

        <Separator className="opacity-70" />

        <div className="p-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-background/50 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-glow">
              {user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.fullName || 'User'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.emailAddresses[0]?.emailAddress}
              </p>
            </div>
            {me?.plan === 'pro' && (
              <Badge variant="soft" className="shrink-0">
                <Crown className="mr-1 h-3 w-3" />
                Pro
              </Badge>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto surface-mesh">
        <Outlet />
      </main>
    </div>
  )
}

function NavItem({
  to,
  icon,
  label,
  active,
}: {
  to: string
  icon: React.ReactNode
  label: string
  active: boolean
}) {
  return (
    <Link to={to} className={cn('nav-link', active && 'nav-link-active')}>
      {icon}
      {label}
    </Link>
  )
}

function membershipRole(
  orgList: { organization: { id: string }; role: string }[] | undefined,
  orgId: string
): 'owner' | 'editor' | 'viewer' {
  const found = orgList?.find((o) => o.organization.id === orgId)
  const role = found?.role
  if (role === 'org:admin' || role === 'owner') return 'owner'
  if (role === 'org:member' || role === 'editor') return 'editor'
  return 'viewer'
}
