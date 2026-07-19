# ChainChat Architecture

This document is the practical companion to `HLD.md` and `LLD.md`. It explains how the codebase is organized and how to work with it.

## Repository Layout

```
chainchat/
├── apps/web/                 # React + Vite SPA (frontend)
├── services/                 # FastAPI + Uvicorn microservices (backend)
│   ├── gateway/              # Public API gateway
│   ├── auth-service/         # Users, workspaces, Clerk webhooks
│   ├── workflow-service/     # Workflow CRUD, versions, templates, sharing
│   ├── execution-service/    # AI execution engine
│   ├── billing-service/       # Stripe subscription scaffolding
│   └── notification-service/ # Emails, notifications
├── infra/terraform/          # AWS infrastructure as code
├── docs/                     # HLD, LLD, architecture docs
├── packages/                 # Shared code (reserved)
├── .github/workflows/        # CI/CD
├── docker-compose.yml        # Local development orchestration
└── Makefile                  # Common development commands
```

## Development Workflow

```bash
# Create Python virtual environments for every service
make venv

# Install all dependencies
make install

# Start local stack (Postgres, Redis, all services, frontend)
make dev

# Run migrations
make migrate

# Run tests
make test

# Run linters
make lint
```

## Service Boundaries

Each service owns a PostgreSQL schema and exposes REST endpoints under `/api/v1`. The gateway routes public traffic and validates Clerk JWTs.

| Service | Schema | Main responsibility |
|---|---|---|
| gateway | none | Auth, routing, rate limiting |
| auth-service | `auth` | User/org sync, memberships, audit logs |
| workflow-service | `workflow` | Workflow graphs, versions, templates, sharing |
| execution-service | `execution` | DAG execution, AI providers, result streaming |
| billing-service | `billing` | Stripe subscriptions, usage records |
| notification-service | `notification` | Emails, in-app notifications |

## Request Flow

```
Browser (React + Clerk token)
        │
        ▼
   CloudFront
        │
        ▼
   ALB ──▶ Gateway (ECS Fargate)
        │
        ▼
   Internal ECS services (auth, workflow, execution, billing, notification)
        │
        ▼
   RDS PostgreSQL / ElastiCache Redis / S3
```

## Authentication

1. Clerk issues a JWT to the frontend after sign-in.
2. `TokenSync` stores the token in `localStorage` and refreshes it periodically.
3. The frontend sends `Authorization: Bearer <token>` on every API call.
4. The gateway validates the token against Clerk's JWKS endpoint.
5. The gateway adds `x-user-id`, `x-workspace-id`, and `x-role` headers before forwarding the request.

## Database

- One RDS PostgreSQL instance.
- Each service uses its own schema (`auth`, `workflow`, `execution`, `billing`, `notification`).
- Each service has its own Alembic migration history.
- Local development uses the `postgres:16-alpine` container from `docker-compose.yml`.

## AI Execution

The execution service runs workflows as DAGs:

1. Build a dependency graph from nodes and edges.
2. Topologically sort or BFS from the start node.
3. For each prompt node, call the selected provider (OpenAI or Anthropic).
4. Persist each step's input, output, latency, and cost estimate.
5. Stream progress via Server-Sent Events.

## Deployment

AWS resources are managed with Terraform:

- ECS Fargate for all services
- RDS PostgreSQL Multi-AZ
- ElastiCache Redis
- ALB + CloudFront
- S3 for assets
- Route 53 for DNS
- GitHub Actions for CI/CD

See `infra/terraform/` for the full configuration.

## Adding a New Service

1. Create `services/<name>/`.
2. Add `requirements.txt`, `requirements-dev.txt`, `Dockerfile`, `.env.example`.
3. Create `src/<name>/main.py`, `config.py`, `routers/health.py`.
4. Add DB models if the service owns data, plus Alembic setup.
5. Register the service in `docker-compose.yml` and `infra/terraform/ecs.tf`.
6. Add a route in `services/gateway/src/gateway/main.py`.
7. Add a CI job in `.github/workflows/ci.yml`.

## Environment Variables

Copy `.env.example` to `.env` at the project root and in `apps/web/`. Required placeholders:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`, `CLERK_JWKS_URL`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

The app runs with placeholder responses when keys are not configured.
