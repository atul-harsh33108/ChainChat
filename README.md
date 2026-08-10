# ChainChat — AI Workflow Collaborator

Production-ready MVP for multi-user AI prompt chains. Teams build, share, and remix prompt workflows like Notion docs.

- **Product**: AI Workflow Collaborator
- **Pricing target**: $12/month/team
- **Architecture**: Decoupled React/Vite SPA + FastAPI + Uvicorn microservices
- **Deployment**: AWS ECS Fargate, Terraform, GitHub Actions
- **Status**: P0–P3 complete (CI green, webhook routing, templates end-to-end, frontend honesty pass) — see [Progress Tracker](docs/audit/PROGRESS.md)

## Quick Start

```bash
# 1. Create Python virtual environments and install all dependencies
make venv
make install

# 2. Start local services (Postgres, Redis, all backend services, frontend)
make dev

# 3. Open the app
open http://localhost:5173
```

> ⚠️ **Local gotcha:** pydantic-settings prefers **real environment variables over each service's `.env` file**. If your machine globally exports `DATABASE_URL` / `REDIS_URL` (e.g. from another project), local runs and `pytest` will silently use them — typically surfacing as `ModuleNotFoundError: psycopg` or connections to the wrong database. Clear them first: `$env:DATABASE_URL=$null; $env:REDIS_URL=$null` (PowerShell) or `unset DATABASE_URL REDIS_URL` (bash).

## Project Structure

```
chainchat/
├── apps/
│   └── web/                 # React + Vite frontend
├── services/
│   ├── gateway/             # API gateway (JWT validation + routing)
│   ├── auth-service/        # Users, workspaces, invites, admin console
│   ├── workflow-service/    # Workflow CRUD, versions, templates
│   ├── execution-service/   # AI execution engine
│   ├── billing-service/     # Stripe subscription scaffolding
│   └── notification-service/# Emails, webhooks
├── packages/
│   └── shared/              # Shared types/events
├── infra/
│   └── terraform/           # AWS infrastructure
├── docs/
│   ├── audit/               # Verified audit, implementation plan, live progress tracker
│   ├── HLD.md               # High-Level Design
│   └── LLD.md               # Low-Level Design
├── docker-compose.yml
└── Makefile
```

## Documentation

- [Product Pitch (plain-language overview)](docs/PRODUCT-PITCH.md) — what ChainChat is, the problem it solves, and how it works for a non-technical reader
- [How It Works (implementation ground truth)](docs/HOW-IT-WORKS.md) — how the product actually behaves as built, including what's real vs. still stubbed
- [Codebase Audit (2026-08-06)](docs/audit/AUDIT.md) — verified status of every feature: what works, what's broken, what's missing
- [Implementation Plan](docs/audit/IMPLEMENTATION-PLAN.md) — phased roadmap for closing the gaps
- [Progress Tracker](docs/audit/PROGRESS.md) — **live status board + session log; read this first when resuming work**
- [High-Level Design (HLD)](docs/HLD.md)
- [Low-Level Design (LLD)](docs/LLD.md)
- [Architecture & Developer Guide](docs/ARCHITECTURE.md)
- [Production Runbook](docs/RUNBOOK.md)

## How It Works (at a glance)

A React/Vite SPA authenticates with Clerk and calls a single FastAPI **gateway**, which validates the JWT, injects `x-user-id` / `x-workspace-id` / `x-role` headers, and proxies each request by path prefix to one of six services. The **workflow-service** (real CRUD, versions, forks, templates) and **execution-service** (a real DAG engine that runs prompt-chain steps in dependency order, with retries and cancellation, calling live LLMs through OpenRouter) are fully implemented **and wired end-to-end from the UI** — you can build, save, run, and remix a prompt chain and watch it execute. The **auth-service** persists users via just-in-time Clerk sync and hosts the **admin console** (user directory, time-limited Pro grants); its workspace CRUD and Clerk webhook are still stubs. **Billing** makes real Stripe calls with placeholder fallbacks, and the **notification-service** has real CRUD but no triggers yet. See [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) for the full walkthrough and [docs/audit/AUDIT.md](docs/audit/AUDIT.md) for the verified gap list.

### Current Implementation Status (2026-08-06)

| Capability | Status |
|---|---|
| Gateway routing + JWT validation | ✅ Real (JWKS verification opt-in; dev bypass default) |
| User persistence | ✅ Real (JIT sync on `users/me`; webhook handler is no-op) |
| Workspace/membership persistence | ⚠️ Stubbed (returns demo workspace) |
| Admin console | ✅ Fully implemented (user directory, Pro grants, audit log) |
| Workflow CRUD / versions / fork / templates | ✅ Fully implemented (no publish/unpublish or template-create endpoints) |
| Execution engine (DAG, retries, cancel) | ✅ Fully implemented |
| AI providers | ✅ All routed through OpenRouter (single provider) |
| Frontend run-a-workflow flow | ✅ Fully wired (build → save → run → poll → results) |
| Live execution updates | ⚠️ SSE polls DB; frontend polls REST instead |
| Cross-service events / notifications | ❌ Not implemented |
| Billing lifecycle | ⚠️ Real Stripe calls with placeholders; webhooks no-op; no state machine |
| Plan enforcement / usage metering | ❌ Not implemented (entitlements computed but unused) |
| Comments | ❌ Model/schemas only — no API, no UI |
| RBAC / Authorization | ❌ Not implemented — `x-role` injected but unread |

## Services

| Service | Local URL | Health Check |
|---|---|---|
| Web (Vite) | http://localhost:5173 | - |
| Gateway | http://localhost:8000 | `/api/v1/health` |
| Auth Service | http://localhost:8001 | `/api/v1/health` |
| Workflow Service | http://localhost:8002 | `/api/v1/health` |
| Execution Service | http://localhost:8003 | `/api/v1/health` |
| Billing Service | http://localhost:8004 | `/api/v1/health` |
| Notification Service | http://localhost:8005 | `/api/v1/health` |

## Development Commands

```bash
make venv          # create all .venv directories
make install       # install Python + Node dependencies
make dev           # start docker-compose local stack
make test          # run all tests
make lint          # run linters (ruff, mypy, eslint)
make format        # auto-format code (ruff + prettier)
make migrate       # run Alembic migrations for all services
make seed          # seed the template gallery with starter templates
```

## Environment Setup

Copy `.env.example` to `.env` in each service and in `apps/web`. Fill in Clerk, Stripe, OpenAI, and Anthropic keys where applicable. The app runs with placeholder integrations when keys are omitted. (`OPENAI_API_KEY` is used as the **OpenRouter** key by the execution-service.)

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend Clerk authentication |
| `CLERK_SECRET_KEY`, `CLERK_JWKS_URL` | Backend Clerk token validation |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | AI model access (execution-service uses OpenRouter) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Billing integration |
| `DATABASE_URL` | PostgreSQL connection (per-service schema via search_path) |
| `REDIS_URL` | Redis connection (RQ queue for execution service) |

## Implementation Phases (from audit)

| Phase | Theme | Status |
|---|---|---|
| P0 | Make CI green (ESLint, Prettier, mypy) | ✅ **Complete** 2026-08-06 |
| P1 | Gateway webhook routing (Clerk + Stripe) | ✅ **Complete** 2026-08-06 |
| P2 | Templates end-to-end (apply + seed data) | ✅ **Complete** 2026-08-06 |
| P3 | Frontend honesty pass (dashboard, billing, members) | ✅ **Complete** 2026-08-06 |
| P4 | Auth completion (workspaces CRUD, Clerk webhook sync) | ⬜ **Next** |
| P5 | Authorization / RBAC | ⬜ |
| P6 | Billing lifecycle + plan gating + usage | ⬜ |
| P7 | Comments, notifications, events | ⬜ |
| P8 | Workflow semantics (publish, decision nodes) | ⬜ |
| P9 | Hardening & coverage (rate limiting, fail-closed JWT, tests) | ⬜ |

See [IMPLEMENTATION-PLAN.md](docs/audit/IMPLEMENTATION-PLAN.md) for details and [PROGRESS.md](docs/audit/PROGRESS.md) for live status.

## Troubleshooting (common issues)

| Symptom | Likely Cause | Fix |
|---|---|---|
| 401 on all API calls | Clerk JWKS URL missing or wrong | Check `CLERK_JWKS_URL` in gateway |
| 503 from gateway | Upstream service unhealthy | Check ECS task health, CloudWatch logs |
| DB connection errors | RDS security group or credentials | Verify `DATABASE_URL` and SG rules |
| Frontend blank | Missing Clerk publishable key | Check `VITE_CLERK_PUBLISHABLE_KEY` |
| AI execution fails | Missing/invalid OpenRouter key or retired model id | Check execution-service env; verify model IDs at openrouter.ai/models |
| Executions stuck in `pending` | RQ worker not consuming the `execution` queue | Run the `execution-worker` service (included in docker-compose) |
| Local tests/dev hit wrong database | Global `DATABASE_URL`/`REDIS_URL` override service `.env` | Clear them before running locally (see "Local gotcha" above) |

Full runbook: [docs/RUNBOOK.md](docs/RUNBOOK.md)

## License

MIT