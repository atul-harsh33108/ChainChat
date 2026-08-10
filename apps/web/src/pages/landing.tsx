import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Logo } from '@/components/brand/Logo'
import { ChainConstellation } from '@/components/brand/ChainConstellation'
import { Workflow, Share2, Bot, ArrowRight, Sparkles } from 'lucide-react'

const features = [
  {
    icon: Workflow,
    title: 'Visual builder',
    description:
      'Compose prompt, decision, and output nodes on an infinite canvas. Inputs flow forward automatically.',
  },
  {
    icon: Share2,
    title: 'Share & remix',
    description:
      'Publish workflows like documents. Teammates run them as-is or fork and refine their own copy.',
  },
  {
    icon: Bot,
    title: 'Multi-model runs',
    description:
      'One engine for OpenAI and Anthropic. Full step history, costs, and outputs you can revisit.',
  },
]

const steps = [
  { title: 'Design the chain', body: 'Drop steps, write prompts, wire the path once.' },
  { title: 'Invite the team', body: 'Everyone runs the same process with their own inputs.' },
  { title: 'Iterate in public', body: 'Remix published chains. Keep what works, cut what doesn’t.' },
]

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden surface-mesh">
      <div className="pointer-events-none absolute inset-0 surface-grain opacity-60" />

      <header className="relative z-20 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo size="md" />
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link
              to="/templates"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Templates
            </Link>
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/sign-up">
              <Button size="sm">
                Get started
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-8 pt-16 md:pb-12 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="animate-fade-up">
              <p className="section-label mb-5 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/70 px-3 py-1 shadow-soft">
                <Sparkles className="h-3 w-3 text-primary" />
                AI workflows for teams
              </p>
              <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-foreground text-balance sm:text-5xl md:text-[3.4rem]">
                Prompt chains, built once —
                <span className="block text-primary">shared like documents.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-balance">
                Stop retyping the same multi-step AI process. Design a reusable workflow, hand it to
                your team, and run it with one click.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link to="/sign-up">
                  <Button size="lg">
                    Start free trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/templates">
                  <Button size="lg" variant="outline">
                    Explore templates
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                $12/month per team · No credit card required
              </p>
            </div>

            <div className="animate-fade-up delay-200 relative">
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-primary/10 via-transparent to-sky-300/10 blur-2xl" />
              <div className="glass-panel relative overflow-hidden rounded-[1.75rem] p-3 md:p-4">
                <div className="mb-3 flex items-center gap-2 px-2 pt-1">
                  <span className="h-2 w-2 rounded-full bg-primary/70" />
                  <span className="h-2 w-2 rounded-full bg-border" />
                  <span className="h-2 w-2 rounded-full bg-border" />
                  <span className="ml-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                    workflow canvas
                  </span>
                </div>
                <ChainConstellation className="aspect-[16/9] w-full" />
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="mb-10 max-w-2xl animate-fade-up">
            <p className="section-label mb-3">Why ChainChat</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
              The missing layer between a chat window and a real process.
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {features.map((feature, i) => (
              <Card
                key={feature.title}
                className={`group hover:shadow-lift hover:-translate-y-0.5 animate-fade-up delay-${(i + 1) * 100}`}
              >
                <CardHeader>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription className="text-[15px] leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-6 pb-20 md:pb-28">
          <div className="glass-panel overflow-hidden rounded-[1.75rem]">
            <div className="grid md:grid-cols-[0.9fr_1.1fr]">
              <div className="border-b border-border/70 p-8 md:border-b-0 md:border-r md:p-10">
                <p className="section-label mb-3">How it works</p>
                <h2 className="font-display text-3xl font-semibold tracking-tight">
                  Three quiet steps from idea to team ritual.
                </h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  Think of it as a living document for AI work — design the line once, then press
                  run.
                </p>
                <Link to="/sign-up" className="mt-8 inline-flex">
                  <Button>
                    Create your first chain
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className="divide-y divide-border/70">
                {steps.map((step, index) => (
                  <div key={step.title} className="flex gap-5 p-7 md:p-8">
                    <span className="font-display text-2xl font-semibold text-primary/80 tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-semibold tracking-tight">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {step.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 bg-background/50">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
          <Logo size="sm" />
          <p className="text-sm text-muted-foreground">
            Build multi-step AI work once. Share it forever.
          </p>
        </div>
      </footer>
    </div>
  )
}
