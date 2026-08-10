import { Link } from 'react-router-dom'
import { SignUp } from '@clerk/clerk-react'
import { Card, CardContent } from '@/components/ui/card'
import { Logo } from '@/components/brand/Logo'

export function SignUpPage() {
  return (
    <div className="relative min-h-screen surface-mesh">
      <div className="pointer-events-none absolute inset-0 surface-grain opacity-50" />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-6">
        <Link to="/" className="mb-8">
          <Logo size="md" />
        </Link>
        <Card className="w-full max-w-md border-border/70 shadow-lift">
          <CardContent className="pt-6">
            <div className="mb-5 text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Start building chains
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Free trial · $12/month per team after.
              </p>
            </div>
            <SignUp routing="path" path="/sign-up" signInUrl="/login" fallbackRedirectUrl="/app" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
