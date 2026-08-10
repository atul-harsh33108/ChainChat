import { Link, useNavigate } from 'react-router-dom'
import { useOrganization, useOrganizationList } from '@clerk/clerk-react'
import { useTemplates } from '@/hooks/workflows'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Logo } from '@/components/brand/Logo'
import { ArrowLeft, Sparkles, ArrowRight } from 'lucide-react'

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
    <div className="relative min-h-screen surface-mesh">
      <div className="pointer-events-none absolute inset-0 surface-grain opacity-50" />

      <header className="relative z-20 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" aria-label="Back to home">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Logo size="sm" />
          </div>
          <Link to="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-12 md:py-16">
        <div className="mb-10 max-w-2xl animate-fade-up">
          <p className="section-label mb-3">Template gallery</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Start from a proven chain
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Browse official and community prompt-chain templates. Fork any template into your
            workspace and make it yours.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-5 md:grid-cols-3">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
          </div>
        ) : templates?.length ? (
          <div className="grid gap-5 md:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="group flex flex-col hover:shadow-lift hover:-translate-y-0.5">
                <CardHeader className="flex-1">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-lg">{t.name}</CardTitle>
                  <CardDescription className="mt-1.5 line-clamp-3">
                    {t.description || 'No description'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {t.category && <Badge variant="soft">{t.category}</Badge>}
                    {t.is_public && <Badge variant="outline">Public</Badge>}
                  </div>
                  <Button className="w-full" onClick={() => handleUse(t.id)}>
                    Use template
                    <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Button>
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
