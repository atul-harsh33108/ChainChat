import { SignUp } from '@clerk/clerk-react'
import { Card, CardContent } from '@/components/ui/card'

export function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <SignUp routing="path" path="/sign-up" signInUrl="/login" />
        </CardContent>
      </Card>
    </div>
  )
}
