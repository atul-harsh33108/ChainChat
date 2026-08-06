import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { TokenSync } from '@/components/auth/TokenSync'
import { ClerkProviderWithRouter } from '@/components/auth/ClerkProviderWithRouter'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './index.css'

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
  </StrictMode>
)
