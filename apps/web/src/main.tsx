import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.tsx'
import { TokenSync } from '@/components/auth/TokenSync'
import './index.css'

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY}>
      <TokenSync>
        <App />
      </TokenSync>
    </ClerkProvider>
  </StrictMode>,
)
