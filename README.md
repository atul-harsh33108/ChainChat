<div align="center">

# ⛓️ ChainChat

**Build, share, and run multi-step AI prompt chains — like Notion docs for AI workflows.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-FF5A5F.svg)](https://github.com/prettier/prettier)

</div>

---

## Overview

ChainChat is a **team workspace for multi-step AI work**. Most people use AI one message
at a time — retyping the same long prompts and copy-pasting outputs between steps.
ChainChat turns those sequences into **reusable, shareable workflows**:

> **Build the recipe once, run it any time, share it with everyone.**

- 🧱 **Build** — drag prompt steps onto a visual canvas and connect them into a chain
- ▶️ **Run** — one click executes the whole chain against live LLMs in dependency order
- 🔁 **Remix** — fork, template, publish, and share workflows like Notion docs
- 📊 **Review** — every run and every step output is saved and inspectable

Targeted at marketing, support, ops, and analyst teams that run repeatable AI routines,
with simple team pricing (target: **$12/month per team**) — sitting in the gap between a
collaborative doc tool (Notion) and a single-turn chatbot (ChatGPT).

## ✨ Highlights

- **Real, end-to-end core loop** — build → save → run → watch it execute → read results, fully wired from the UI all the way to live LLMs (via OpenRouter). Not a mock-up.
- **A genuine DAG execution engine** — Kahn's topological sort with cycle detection, per-step retries with rate-limit-aware backoff (honors `Retry-After`), cooperative cancellation, and friendly provider errors.
- **Workflows as team assets** — immutable version history, one-click forking with ID remapping, a seeded template gallery, plus publish/share and save-as-template.
- **Production-shaped architecture** — six FastAPI microservices behind a JWT-validating API gateway, each service owning its own PostgreSQL schema; deployable to AWS ECS Fargate via Terraform.
- **Typed at every boundary** — Pydantic v2 request/response models and RFC 7807 problem details in the backend, strict TypeScript + ESLint (zero-warning policy) in the frontend, auto-generated OpenAPI docs on every service.
- **Quality gates that pass** — ESLint, Prettier, `tsc`, Ruff, mypy, pytest, and Vitest all green in CI.
- **One-command local dev** — `make dev` brings up Postgres, Redis, all six services, an RQ worker, and the frontend.

## 🚀 Features

### 🎨 Visual Workflow Builder
- React Flow canvas: add prompt steps, connect them, and see the chain take shape
- Per-step model selection with sensible free-model defaults
- Auto-save with immutable versions — every edit is recoverable

### ⚡ Execution
- One-click runs with user-provided inputs
- Live step-by-step progress until the chain completes
- Automatic retries on transient/provider errors; cancel a run at any time
- Full run history with each step's output stored and reviewable

### 🤝 Collaboration & Sharing
- Template gallery with seeded starter templates; apply one to a new workflow in a click
- Publish a version to share it, or save any workflow as a reusable template
- Fork any workflow to remix it without affecting the original
- Real dashboard (recent workflows + plan badge) and members list backed by Clerk

### 🏢 Platform
- Clerk authentication with just-in-time user sync
- Admin console: user directory, time-limited Pro grants, audit log
- Stripe-ready billing: checkout and customer-portal flows wired with graceful fallbacks
- Notification service foundations (CRUD, preferences) ready for triggers
- Health checks and interactive OpenAPI docs (`/docs`) on every service

## 🏗️ Architecture

```
Browser (React + Vite SPA, Clerk auth)
        │  HTTPS/JSON · Authorization: Bearer <clerk-token>
        ▼
Gateway (:8000) — validates JWT, injects identity headers, proxies by path prefix
        │
        ├─ /api/v1/auth|users|workspaces|admin ─▶ auth-service          (:8001)
        ├─ /api/v1/workflows|templates         ─▶ workflow-service      (:8002)
        ├─ /api/v1/executions                  ─▶ execution-service     (:8003)
        ├─ /api/v1/billing                     ─▶ billing-service       (:8004)
        └─ /api/v1/notifications               ─▶ notification-service  (:8005)
                                                          │
                                                          ▼
                                    PostgreSQL 16 (per-service schema) + Redis 7 (execution queue)
```

The SPA authenticates with **Clerk** and calls a single FastAPI **gateway**, which
validates the JWT, injects `x-user-id` / `x-workspace-id` / `x-role` headers, and proxies
each request by path prefix to one of six services. Executions are queued on Redis and
processed by a dedicated **RQ worker**, which walks the workflow DAG in dependency order
and calls live LLMs through **OpenRouter**. In production the same topology deploys to
AWS (ECS Fargate, RDS Multi-AZ, ElastiCache, ALB + CloudFront) via Terraform.

## 🧰 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19 · TypeScript · Vite 8 · Tailwind CSS 3 · Radix UI · TanStack Query 5 · Zustand 5 · React Router 7 · React Flow 11 |
| **Backend** | FastAPI 0.115 · Uvicorn · Gunicorn · Pydantic v2 · httpx · structlog · python-jose |
| **Data** | PostgreSQL 16 · SQLAlchemy 2 (async) · asyncpg · Alembic migrations |
| **Queue** | Redis 7 · RQ (execution worker) |
| **Auth** | Clerk (React SDK + JWKS JWT validation at the gateway) |
| **AI** | OpenRouter — one OpenAI-compatible gateway to many models |
| **Billing** | Stripe (checkout + customer portal) |
| **Infra** | Docker · AWS ECS Fargate · RDS Multi-AZ · ElastiCache · ALB · CloudFront · Terraform |
| **CI/CD** | GitHub Actions (lint, type-check, test, build) |
| **Testing** | pytest · Vitest · React Testing Library · Playwright |
| **Quality** | ESLint · Prettier · Ruff · mypy |

## ⚡ Quick Start

**Prerequisites:** Docker, Python 3.12, Node 20, `make`.

```bash
# 1. Create Python virtual environments and install all dependencies
make venv
make install

# 2. Start the local stack (Postgres, Redis, all backend services, frontend)
make dev

# 3. Open the app
open http://localhost:5173
```

First run on a fresh database:

```bash
make migrate   # run Alembic migrations for all services
make seed      # seed the template gallery with starter templates
```

> ⚠️ **Local gotcha:** pydantic-settings prefers **real environment variables over each
> service's `.env` file**. If your machine globally exports `DATABASE_URL` / `REDIS_URL`
> (e.g. from another project), local runs and `pytest` will silently use them — typically
> surfacing as `ModuleNotFoundError: psycopg` or connections to the wrong database. Clear
> them first: `$env:DATABASE_URL=$null; $env:REDIS_URL=$null` (PowerShell) or
> `unset DATABASE_URL REDIS_URL` (bash).

### Services

| Service | Local URL | Health Check |
|---|---|---|
| Web (Vite) | http://localhost:5173 | - |
| Gateway | http://localhost:8000 | `/api/v1/health` |
| Auth Service | http://localhost:8001 | `/api/v1/health` |
| Workflow Service | http://localhost:8002 | `/api/v1/health` |
| Execution Service | http://localhost:8003 | `/api/v1/health` |
| Billing Service | http://localhost:8004 | `/api/v1/health` |
| Notification Service | http://localhost:8005 | `/api/v1/health` |

## 📁 Project Structure

```
chainchat/
├── apps/
│   └── web/                 # React + Vite frontend (landing, dashboard, builder, runs, admin)
├── services/
│   ├── gateway/             # API gateway (JWT validation + routing)
│   ├── auth-service/        # Users, workspaces, invites, admin console
│   ├── workflow-service/    # Workflow CRUD, versions, forks, templates
│   ├── execution-service/   # AI execution engine + RQ worker
│   ├── billing-service/     # Stripe checkout, portal, subscriptions
│   └── notification-service/# Notifications (email/webhooks planned)
├── infra/
│   └── terraform/           # AWS infrastructure as code
├── docs/                    # Product, design, architecture, and audit docs
├── .github/workflows/       # CI/CD pipelines
├── docker-compose.yml       # Full local stack
└── Makefile                 # Developer commands
```

Each Python service follows the same layout: `src/<name>/` with `main.py`, `config.py`,
`routers/`, `services/`, SQLAlchemy `models.py`, Pydantic `schemas.py`, plus its own
Alembic migration history scoped to its PostgreSQL schema.

## 🔑 Environment Setup

Copy `.env.example` to `.env` at the project root (and in each service / `apps/web` where
applicable). Fill in Clerk, Stripe, and AI keys where you have them — the app runs with
placeholder integrations when keys are omitted. (`OPENAI_API_KEY` is used as the
**OpenRouter** key by the execution-service.)

| Variable | Purpose |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend Clerk authentication |
| `CLERK_SECRET_KEY`, `CLERK_JWKS_URL` | Backend Clerk token validation |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | AI model access (execution-service uses OpenRouter) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Billing integration |
| `DATABASE_URL` | PostgreSQL connection (per-service schema via `search_path`) |
| `REDIS_URL` | Redis connection (RQ queue for the execution service) |
| `ADMIN_EMAILS` | Comma-separated emails allowed into the admin console |

## 🛠️ Development Commands

```bash
make venv          # create all .venv directories
make install       # install Python + Node dependencies
make dev           # start the docker-compose local stack
make test          # run all tests (pytest + vitest)
make lint          # run linters (ruff, mypy, eslint)
make format        # auto-format code (ruff + prettier)
make migrate       # run Alembic migrations for all services
make seed          # seed the template gallery with starter templates
```

## 📚 Documentation

| Document | What you'll find |
|---|---|
| [Product Pitch](docs/PRODUCT-PITCH.md) | Plain-language overview — the problem, the solution, who it's for |
| [How It Works](docs/HOW-IT-WORKS.md) | Implementation ground truth — how the product actually behaves as built |
| [Status & Roadmap](docs/STATUS.md) | Current implementation status and the phased roadmap |
| [High-Level Design](docs/HLD.md) | System context, container architecture, NFRs |
| [Low-Level Design](docs/LLD.md) | Service internals, schemas, API contracts |
| [Architecture & Developer Guide](docs/ARCHITECTURE.md) | Repo layout, service boundaries, adding a new service |
| [Production Runbook](docs/RUNBOOK.md) | Deploying to AWS, migrations, monitoring, on-call fixes |
| [Codebase Audit](docs/audit/AUDIT.md) | Verified status of every feature: what works, what's broken, what's missing |
| [Implementation Plan](docs/audit/IMPLEMENTATION-PLAN.md) | Phased roadmap for closing the gaps |
| [Progress Tracker](docs/audit/PROGRESS.md) | Live status board + session log |

## 🩺 Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| 401 on all API calls | Clerk JWKS URL missing or wrong | Check `CLERK_JWKS_URL` in gateway |
| 503 from gateway | Upstream service unhealthy | Check service health / ECS task health, CloudWatch logs |
| DB connection errors | RDS security group or credentials | Verify `DATABASE_URL` and SG rules |
| Frontend blank | Missing Clerk publishable key | Check `VITE_CLERK_PUBLISHABLE_KEY` |
| AI execution fails | Missing/invalid OpenRouter key or retired model id | Check execution-service env; verify model IDs at openrouter.ai/models |
| Executions stuck in `pending` | RQ worker not consuming the `execution` queue | Run the `execution-worker` service (included in docker-compose) |
| Local tests/dev hit wrong database | Global `DATABASE_URL`/`REDIS_URL` override service `.env` | Clear them before running locally (see Quick Start gotcha) |

Full runbook: [docs/RUNBOOK.md](docs/RUNBOOK.md)

## 🗺️ Roadmap

For the current implementation status and the phased roadmap (P0–P9), see
[docs/STATUS.md](docs/STATUS.md).

## 📄 License

AGPL
