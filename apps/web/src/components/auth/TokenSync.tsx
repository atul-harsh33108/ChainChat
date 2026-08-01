import { useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { setTokenProvider } from '@/lib/api'

export function TokenSync({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn } = useAuth()

  // Let the API client pull a fresh token per request (avoids a startup race
  // where queries fire before the token has been cached).
  useEffect(() => {
    setTokenProvider(() => getToken())
    return () => setTokenProvider(null)
  }, [getToken])

  // Keep a cached copy so a request can still be authorized if Clerk is slow.
  useEffect(() => {
    if (!isSignedIn) {
      localStorage.removeItem('clerk-token')
      return
    }
    const store = () => {
      getToken().then((token) => {
        if (token) localStorage.setItem('clerk-token', token)
      })
    }
    store()
    const id = setInterval(store, 1000 * 60 * 5)
    return () => clearInterval(id)
  }, [getToken, isSignedIn])

  return <>{children}</>
}
