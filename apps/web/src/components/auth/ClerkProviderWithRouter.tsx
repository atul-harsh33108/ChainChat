import { ClerkProvider } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''

/**
 * Clerk must navigate through React Router.
 *
 * With `routing="path"`, Clerk moves between steps by changing the URL (e.g.
 * /sign-up -> /sign-up/verify-email-address). Its default navigation uses
 * history.pushState, which React Router does not observe, so multi-step
 * sign-up/sign-in screens get pushed and then immediately lost. Wiring
 * routerPush/routerReplace to useNavigate keeps both in sync, which requires
 * ClerkProvider to live *inside* BrowserRouter.
 *
 * Lives in its own module: entry files that define components break Fast
 * Refresh (react-refresh/only-export-components).
 */
export function ClerkProviderWithRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()

  return (
    <ClerkProvider
      publishableKey={CLERK_KEY}
      routerPush={(to: string) => navigate(to)}
      routerReplace={(to: string) => navigate(to, { replace: true })}
    >
      {children}
    </ClerkProvider>
  )
}
