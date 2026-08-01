import axios, { AxiosError } from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

/**
 * Async source of the current Clerk session token, registered by <TokenSync>.
 *
 * Reading the token straight from Clerk per request removes the race where a
 * query fires before the token has been written to storage (which produced
 * intermittent 401s on page load). Clerk caches and refreshes internally, so
 * calling this on every request is cheap.
 */
type TokenProvider = () => Promise<string | null>

let tokenProvider: TokenProvider | null = null

export function setTokenProvider(provider: TokenProvider | null) {
  tokenProvider = provider
}

apiClient.interceptors.request.use(async (config) => {
  let token: string | null = null
  try {
    token = tokenProvider ? await tokenProvider() : null
  } catch {
    token = null
  }
  // Fall back to the cached copy if Clerk is not ready yet.
  if (!token) token = localStorage.getItem('clerk-token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('clerk-token')
      // Deliberately no hard redirect: Clerk's <SignedIn>/<SignedOut> guards
      // already handle unauthenticated users, and a location change here would
      // interrupt an active session (and any in-progress auth flow) whenever a
      // single request raced ahead of the token.
    }
    return Promise.reject(error)
  }
)
