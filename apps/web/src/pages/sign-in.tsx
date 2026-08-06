import { SignIn } from '@clerk/clerk-react'
import { Card, CardContent } from '@/components/ui/card'

export function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <SignIn routing="path" path="/login" signUpUrl="/sign-up" fallbackRedirectUrl="/app" />
        </CardContent>
      </Card>
    </div>
  )
}
