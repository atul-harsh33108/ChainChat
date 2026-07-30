import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import App from './App.tsx'
import { TokenSync } from '@/components/auth/TokenSync'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './index.css'

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
 */
function ClerkProviderWithRouter({ children }: { children: React.ReactNode }) {
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ClerkProviderWithRouter>
          <TokenSync>
            <App />
          </TokenSync>
        </ClerkProviderWithRouter>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
