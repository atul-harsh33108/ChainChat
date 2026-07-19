import { Link, useNavigate } from 'react-router-dom'
import { useOrganization, useOrganizationList } from '@clerk/clerk-react'
import { useTemplates } from '@/hooks/workflows'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Sparkles } from 'lucide-react'

export function TemplatesPage() {
  const navigate = useNavigate()
  const { organization } = useOrganization()
  const { setActive } = useOrganizationList()
  const { data: templates, isLoading } = useTemplates()

  const handleUse = async (templateId: string) => {
    const org =
      organization ||
      (
        (await setActive?.({ organization: 'first' })) as
          | { organization?: { id: string } }
          | undefined
      )?.organization
    if (!org) {
      navigate('/login')
      return
    }
    navigate(`/app/w/${org.id}/workflows/new?template=${templateId}`)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <span className="font-bold text-lg">Template gallery</span>
          </div>
          <Link to="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-4">Start with a template</h1>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Browse official and community prompt-chain templates. Fork any template into your workspace and customize it.
        </p>

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : templates?.length ? (
          <div className="grid md:grid-cols-3 gap-6">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-5 w-5" />
                    <CardTitle className="text-lg">{t.name}</CardTitle>
                  </div>
                  <CardDescription>{t.description || 'No description'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{t.category}</Badge>
                    {t.isOfficial && <Badge>Official</Badge>}
                  </div>
                  <Button className="w-full mt-4" onClick={() => handleUse(t.id)}>Use template</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <CardDescription>No templates published yet.</CardDescription>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
