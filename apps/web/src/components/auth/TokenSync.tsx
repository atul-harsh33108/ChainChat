import { useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'

export function TokenSync({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn } = useAuth()

  useEffect(() => {
    if (!isSignedIn) {
      localStorage.removeItem('clerk-token')
      return
    }
    getToken().then((token) => {
      if (token) localStorage.setItem('clerk-token', token)
    })
    const id = setInterval(() => {
      getToken().then((token) => {
        if (token) localStorage.setItem('clerk-token', token)
      })
    }, 1000 * 60 * 5)
    return () => clearInterval(id)
  }, [getToken, isSignedIn])

  return <>{children}</>
}
