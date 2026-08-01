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
import { LayoutDashboard, FileText, Settings, ChevronDown, ShieldCheck, Crown } from 'lucide-react'

export function AppLayout() {
  const { user } = useUser()
  const orgListResult = useOrganizationList()
  const organizationList = (orgListResult as { organizationList?: { organization: { id: string; name: string }; role: string }[] }).organizationList
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
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="truncate">{organization?.name || 'Personal'}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {(organizationList || []).map((item: { organization: { id: string; name: string } }) => (
                <DropdownMenuItem
                  key={item.organization.id}
                  onClick={() => setActive?.({ organization: item.organization.id })}
                >
                  {item.organization.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/app/settings">Create workspace</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Separator />
        <nav className="flex-1 p-4 space-y-1">
          <NavItem
            to={`/app/w/${activeId}`}
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Dashboard"
            active={location.pathname === `/app/w/${activeId}`}
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
            <NavItem
              to="/app/admin"
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Admin"
              active={location.pathname === '/app/admin'}
            />
          )}
        </nav>
        <Separator />
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              {user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.fullName || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.emailAddresses[0]?.emailAddress}
              </p>
            </div>
            {me?.plan === 'pro' && (
              <Badge className="shrink-0">
                <Crown className="h-3 w-3 mr-1" />Pro
              </Badge>
            )}
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
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
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      }`}
    >
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
