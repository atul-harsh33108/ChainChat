import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Workflow, Share2, Bot } from 'lucide-react'

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Workflow className="h-6 w-6" />
            <span className="font-bold text-lg">ChainChat</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/templates" className="text-sm text-muted-foreground hover:text-foreground">
              Templates
            </Link>
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/sign-up">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-5xl font-bold tracking-tight mb-6">
            AI workflows, built together
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Build multi-step AI prompt chains with your team. Share, remix, and run them like Notion docs.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/sign-up">
              <Button size="lg">Start free trial</Button>
            </Link>
            <Link to="/templates">
              <Button size="lg" variant="outline">Explore templates</Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">$12/month per team. No credit card required.</p>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <Workflow className="h-8 w-8 mb-2" />
                <CardTitle>Visual Builder</CardTitle>
                <CardDescription>
                  Drag and drop prompt, decision, and output nodes on an infinite canvas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Define inputs, chain prompts, and route logic with branches.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Share2 className="h-8 w-8 mb-2" />
                <CardTitle>Share & Remix</CardTitle>
                <CardDescription>
                  Share workflows with your team or the world. Fork and remix like a Notion doc.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Built-in permissions, version history, and template gallery.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Bot className="h-8 w-8 mb-2" />
                <CardTitle>Multi-Model AI</CardTitle>
                <CardDescription>
                  Run workflows against OpenAI and Anthropic models with one consistent engine.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Execution history, step-level debugging, and cost estimates.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  )
}
