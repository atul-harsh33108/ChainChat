# AI Workflow Collaborator — High-Level Design (HLD)

## 1. Scope

Build a production-ready MVP for **AI Workflow Collaborator**: a team workspace where users create, share, and execute multi-step AI prompt chains. The product is priced at **$12/month/team** and targets the gap between Notion (collaborative docs) and ChatGPT (single-turn AI).

### MVP Goals
- Teams sign up, create workspaces, and invite members.
- Users build prompt-chain workflows on a visual canvas.
- Workflows execute against OpenAI/Anthropic models.
- Execution history and step-level outputs are visible.
- Workflows can be shared, forked, and remixed like Notion docs.
- Billing scaffolding supports the team plan.
- The stack is deployable to AWS with infrastructure as code.

## 2. Actors & Use Cases

| Actor | Use Cases |
|---|---|
| Workspace Owner | Create workspace, invite members, manage billing, delete workspace. |
| Editor | Build/edit workflows, run workflows, remix shared workflows. |
| Viewer | View workflows and execution history, run read-only workflows. |
| Guest | View public workflows and templates, fork into their own workspace. |
| System | Sync Clerk users/orgs, process Stripe webhooks, execute AI jobs, send audit logs. |

## 3. System Context

```
                    ┌──────────────────────────┐
                    │   AI Workflow Collab     │
                    │      (SaaS Platform)       │
                    └───────────┬──────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
   ┌─────────┐            ┌──────────┐           ┌──────────┐
   │  Clerk  │            │ OpenAI   │           │ Stripe   │
   │ (Auth)  │            │ Anthropic│           │(Billing) │
   └─────────┘            └──────────┘           └──────────┘
```

## 4. Container Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Layer                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  React + Vite SPA                                             │  │
│  │  - Auth via Clerk                                             │  │
│  │  - Workflow builder (React Flow)                              │  │
│  │  - TanStack Query for server state                            │  │
│  │  - Zustand for local UI state                                 │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │ HTTPS / JSON
┌──────────────────────────────────┼──────────────────────────────────┐
│                         API Gateway Layer                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Gateway Service (FastAPI + Uvicorn)                        │    │
│  │  - Clerk JWT validation                                     │    │
│  │  - Rate limiting                                            │    │
│  │  - Request routing to microservices                         │    │
│  │  - CORS / security headers                                  │    │
│  └───────────┬───────────────────┬───────────────────┬──────────┘    │
└──────────────┼───────────────────┼───────────────────┼───────────────┘
               │                   │                   │
   ┌───────────▼────────┐ ┌────────▼───────┐ ┌──────────▼──────────┐
   │  Auth Service      │ │ Workflow       │ │ Execution Service   │
   │  (FastAPI)         │ │ Service        │ │ (FastAPI)           │
   │  - Webhook sync    │ │ (FastAPI)      │ │ - DAG executor      │
   │  - User profiles   │ │ - CRUD         │ │ - AI providers      │
   │  - Org membership  │ │ - Versions     │ │ - Execution history │
   │                    │ │ - Templates    │ │ - Result streaming  │
   └────────────────────┘ └────────────────┘ └─────────────────────┘

   ┌──────────────┐     ┌──────────────┐
   │  Billing     │     │ Notification │
   │  Service     │     │  Service     │
   │  - Stripe    │     │  - Emails    │
   │  - Plans     │     │  - Invites   │
   │  - Usage     │     │  - Webhooks  │
   └──────────────┘     └──────────────┘
```

## 5. Service Boundaries

| Service | Responsibility | Owns |
|---|---|---|
| `gateway` | Public entry point. Validates auth tokens, routes to services, applies rate limits and common middleware. | No business data. |
| `auth-service` | Syncs Clerk users/organizations, manages workspace membership and roles, exposes profile APIs. | `users`, `workspaces`, `memberships`, `audit_logs` |
| `workflow-service` | Manages workflow definitions, node/edge graph, versions, templates, sharing, and permissions. | `workflows`, `workflow_versions`, `workflow_nodes`, `workflow_edges`, `templates`, `comments` |
| `execution-service` | Runs prompt chains. Handles DAG execution, provider abstraction, retries, cost/time tracking, result streaming. | `executions`, `execution_steps` |
| `billing-service` | Stripe integration, subscription lifecycle, plan limits, invoice handling. | `subscriptions`, `invoices`, `usage_records` |
| `notification-service` | Sends emails, invitation links, and internal webhook notifications. | `notifications`, `notification_templates` |

## 6. Data Stores

| Store | Purpose | Services |
|---|---|---|
| PostgreSQL (RDS) | Primary transactional data. One logical database per service (schema separation). | All services write to their own schema. |
| Redis (ElastiCache) | Caching, distributed locks, Pub/Sub for real-time events, job queue (RQ). | gateway, execution, notification |
| S3 | Asset storage: workflow exports, execution result dumps, user uploads. | workflow, execution |

## 7. Inter-Service Communication

- **Synchronous**: REST calls via internal service mesh. Gateway calls services; services call each other only when unavoidable, prefer async events.
- **Asynchronous**: Redis Pub/Sub events for cross-service updates:
  - `user.created`
  - `workspace.invite_accepted`
  - `workflow.forked`
  - `execution.completed`
  - `subscription.updated`

## 8. External Integrations

| Integration | Purpose |
|---|---|
| Clerk | Authentication, user/org management, JWT tokens. |
| OpenAI API | GPT-4o / GPT-3.5 for prompt execution. |
| Anthropic API | Claude 3.5 Sonnet for prompt execution. |
| Stripe | Subscription billing ($12/mo/team). |
| AWS SES / SendGrid placeholder | Transactional emails. |

## 9. Deployment Overview (AWS)

```
                 ┌─────────────┐
                 │   Route 53  │
                 └──────┬──────┘
                        │
                 ┌──────▼──────┐
                 │ CloudFront  │
                 │ (SPA + API) │
                 └──────┬──────┘
                        │
                 ┌──────▼──────┐
                 │     ALB     │
                 └──────┬──────┘
                        │
       ┌────────────────┼────────────────┐
       │                │                │
┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
│  Gateway    │  │  Gateway    │  │  Gateway    │
│  Container  │  │  Container  │  │  Container  │
│  (ECS)      │  │  (ECS)      │  │  (ECS)      │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
        Internal ECS services (auth, workflow, execution, billing, notification)
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│ RDS Postgres │ │ ElastiCache │ │     S3      │
│  Multi-AZ    │ │    Redis    │ │             │
└──────────────┘ └─────────────┘ └─────────────┘
```

- **Container orchestration**: AWS ECS Fargate.
- **Load balancing**: Application Load Balancer.
- **DNS**: Route 53.
- **CDN**: CloudFront for frontend assets.
- **Database**: RDS PostgreSQL with Multi-AZ.
- **Cache/Queue**: ElastiCache Redis.
- **Object storage**: S3.
- **Secrets**: AWS Secrets Manager + SSM Parameter Store.
- **Infra as Code**: Terraform.
- **CI/CD**: GitHub Actions.

## 10. Security

- Clerk short-lived JWT tokens validated on every request.
- Service-to-service calls use internal network + mTLS (envoy/sidecar optional, start with network isolation).
- All secrets stored in AWS Secrets Manager; never in source.
- Input validation with Pydantic on every boundary.
- Rate limiting per user and per workspace.
- SQL injection prevention via SQLAlchemy/Prisma ORM.
- CORS restricted to known origins.
- Audit logs for sensitive actions.

## 11. Non-Functional Requirements

| NFR | Target |
|---|---|
| Availability | 99.9% (single-region, Multi-AZ). |
| Latency | P95 API response < 500ms excluding AI execution. |
| Scalability | Stateless services, horizontal scaling via ECS. |
| Test coverage | >70% unit test coverage on execution engine. |
| Observability | Structured logs, Sentry, CloudWatch metrics. |
| Deploy frequency | On-merge to main via GitHub Actions. |

## 12. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, React Router, React Flow |
| Gateway | FastAPI, Uvicorn, Gunicorn, python-jose, slowapi |
| Microservices | FastAPI, Uvicorn, SQLAlchemy 2, Alembic, Pydantic v2 |
| AI Execution | FastAPI, RQ (Redis Queue), httpx |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 |
| ORM | SQLAlchemy 2 + Alembic |
| Auth | Clerk (JWT validation in gateway) |
| AI Providers | OpenAI, Anthropic (via httpx) |
| Billing | Stripe (python SDK) |
| Deployment | Docker, AWS ECS Fargate, Terraform |
| CI/CD | GitHub Actions |
| Testing | pytest, Playwright |
| Observability | Sentry, CloudWatch, structlog |
