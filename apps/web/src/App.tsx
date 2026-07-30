// BrowserRouter lives in main.tsx so ClerkProvider can render inside it.
import { Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LandingPage } from '@/pages/landing'
import { SignInPage } from '@/pages/sign-in'
import { SignUpPage } from '@/pages/sign-up'
import { DashboardPage } from '@/pages/dashboard'
import { WorkflowListPage } from '@/pages/workflow-list'
import { WorkflowBuilderPage } from '@/pages/workflow-builder'
import { WorkflowRunsPage } from '@/pages/workflow-runs'
import { SettingsPage } from '@/pages/settings'
import { TemplatesPage } from '@/pages/templates'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/toaster'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <Navigate to="/login" replace />
      </SignedOut>
    </>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            {/* Splat routes are required: Clerk's path routing navigates to
                sub-paths such as /sign-up/verify-email-address (OTP step) and
                /login/factor-one. Exact paths leave those URLs unmatched, which
                renders a blank page. */}
            <Route path="/login/*" element={<SignInPage />} />
            <Route path="/sign-up/*" element={<SignUpPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="w/:workspaceId" element={<DashboardPage />} />
              <Route path="w/:workspaceId/workflows" element={<WorkflowListPage />} />
              <Route path="w/:workspaceId/workflows/new" element={<WorkflowBuilderPage />} />
              <Route path="w/:workspaceId/workflows/:workflowId" element={<WorkflowBuilderPage />} />
              <Route path="w/:workspaceId/workflows/:workflowId/runs" element={<WorkflowRunsPage />} />
              <Route path="w/:workspaceId/settings" element={<SettingsPage />} />
            </Route>
            {/* Fallback so an unmatched URL never renders an empty page. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        <Toaster />
    </QueryClientProvider>
  )
}

export default App
