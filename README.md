# ChainChat — AI Workflow Collaborator

Production-ready MVP for multi-user AI prompt chains. Teams build, share, and remix prompt workflows like Notion docs.

- **Product**: AI Workflow Collaborator
- **Pricing target**: $12/month/team
- **Architecture**: Decoupled React/Vite SPA + FastAPI + Uvicorn microservices
- **Deployment**: AWS ECS Fargate, Terraform, GitHub Actions

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

## Project Structure

```
chainchat/
├── apps/
│   └── web/                 # React + Vite frontend
├── services/
│   ├── gateway/             # API gateway (JWT validation + routing)
│   ├── auth-service/        # Users, workspaces, invites
│   ├── workflow-service/    # Workflow CRUD, versions, templates
│   ├── execution-service/   # AI execution engine
│   ├── billing-service/     # Stripe subscription scaffolding
│   └── notification-service/# Emails, webhooks
├── packages/
│   └── shared/              # Shared types/events
├── infra/
│   └── terraform/           # AWS infrastructure
├── docs/
│   ├── HLD.md               # High-Level Design
│   └── LLD.md               # Low-Level Design
├── docker-compose.yml
└── Makefile
```

## Documentation

- [Product Pitch (plain-language overview)](docs/PRODUCT-PITCH.md) — what ChainChat is, the problem it solves, and how it works for a non-technical reader
- [How It Works (implementation ground truth)](docs/HOW-IT-WORKS.md) — how the product actually behaves as built, including what's real vs. still stubbed
- [High-Level Design (HLD)](docs/HLD.md)
- [Low-Level Design (LLD)](docs/LLD.md)
- [Architecture & Developer Guide](docs/ARCHITECTURE.md)
- [Production Runbook](docs/RUNBOOK.md)

## How It Works (at a glance)

A React/Vite SPA authenticates with Clerk and calls a single FastAPI **gateway**, which
validates the JWT, injects `x-user-id` / `x-workspace-id` / `x-role` headers, and proxies
each request by path prefix to one of six services. Today the **workflow-service** (real
CRUD, versions, forks, templates) and **execution-service** (a real DAG engine that runs
prompt-chain steps in dependency order, with retries and cancellation, calling live LLMs
through OpenRouter and streaming progress over polling-based SSE) are fully implemented.
The **auth-service**, **notification-service**, Clerk webhook sync, cross-service events,
and parts of **billing** are still placeholders. See
[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) for the full descriptive walkthrough.

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
make migrate       # run Alembic migrations
make format        # auto-format code
```

## Environment Setup

Copy `.env.example` to `.env` in each service and in `apps/web`. Fill in Clerk, Stripe, OpenAI, and Anthropic keys where applicable. The app runs with placeholder integrations when keys are omitted.

## License

MIT
