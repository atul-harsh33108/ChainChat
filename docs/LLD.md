# AI Workflow Collaborator — Low-Level Design (LLD)

## 1. Project Layout

```
chainchat/
├── apps/
│   ├── web/                    # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/     # shadcn/ui + custom
│   │   │   ├── pages/          # route pages
│   │   │   ├── hooks/          # tanstack query hooks
│   │   │   ├── stores/         # zustand stores
│   │   │   ├── lib/            # api client, utils
│   │   │   └── types/          # shared TS types
│   │   ├── tests/
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   └── package.json
│   └── ...                     # future mobile/admin apps
├── services/
│   ├── gateway/                # API gateway
│   ├── auth-service/
│   ├── workflow-service/
│   ├── execution-service/
│   ├── billing-service/
│   └── notification-service/
├── packages/
│   └── shared/                 # shared types, events, utils (Python + TS)
├── infra/
│   └── terraform/
├── docker-compose.yml          # local dev orchestration
├── Makefile
└── README.md
```

Each Python service follows the same internal layout:

```
services/<name>/
├── .venv/                      # local virtual environment
├── src/
│   └── <name>/
│       ├── __init__.py
│       ├── main.py             # FastAPI app factory
│       ├── config.py           # Pydantic Settings
│       ├── dependencies.py     # auth, db session, etc.
│       ├── db.py               # SQLAlchemy engine/session
│       ├── models.py           # SQLAlchemy models
│       ├── schemas.py          # Pydantic request/response models
│       ├── routers/            # API route modules
│       ├── services/           # business logic
│       ├── events/             # event publishers/consumers
│       └── tasks/              # background job functions
├── alembic/                    # migrations (when service owns data)
├── tests/
├── requirements.txt
├── requirements-dev.txt
├── Dockerfile
└── .env.example
```

## 2. Gateway Service (`services/gateway`)

### Responsibilities
- Validate Clerk JWT on every request.
- Add `x-user-id`, `x-workspace-id`, `x-role` headers to upstream requests.
- Rate limiting (per user + workspace).
- Route requests to internal services.
- CORS + security headers.

### Routes

| Method | Path | Upstream |
|---|---|---|
| ANY | `/api/v1/auth/*` | `auth-service` |
| ANY | `/api/v1/users/*` | `auth-service` |
| ANY | `/api/v1/workspaces/*` | `auth-service` |
| ANY | `/api/v1/workflows/*` | `workflow-service` |
| ANY | `/api/v1/templates/*` | `workflow-service` |
| ANY | `/api/v1/executions/*` | `execution-service` |
| ANY | `/api/v1/billing/*` | `billing-service` |
| ANY | `/api/v1/notifications/*` | `notification-service` |
| ANY | `/api/v1/webhooks/*` | direct to relevant service |

### Auth Flow

```
Client (Clerk token)
        │
        ▼
   [Gateway]
   validate JWT with Clerk JWKS
   extract claims: sub, org_id, org_role
        │
        ▼
   add x-user-id, x-workspace-id, x-role headers
        │
        ▼
   forward to upstream service
```

### Key Pydantic Models

```python
class TokenPayload(BaseModel):
    sub: str          # Clerk user id
    org_id: str | None
    org_role: str | None
    email: str | None
    exp: int
```

## 3. Auth Service (`services/auth-service`)

### Owned Tables (schema: `auth`)

```sql
users
  id uuid pk
  clerk_id text unique
  email text unique
  name text
  avatar_url text
  created_at timestamp
  updated_at timestamp

workspaces
  id uuid pk
  name text
  slug text unique
  plan text              -- 'free' | 'pro'
  subscription_status text
  created_at timestamp
  updated_at timestamp

memberships
  id uuid pk
  user_id uuid fk users
  workspace_id uuid fk workspaces
  role text             -- 'owner' | 'editor' | 'viewer'
  created_at timestamp
  updated_at timestamp

audit_logs
  id uuid pk
  workspace_id uuid
  actor_id uuid
  action text
  target_type text
  target_id text
  metadata jsonb
  created_at timestamp
```

### API Endpoints

```
POST   /api/v1/webhooks/clerk          # sync user/org events
GET    /api/v1/users/me
PATCH  /api/v1/users/me
POST   /api/v1/workspaces
GET    /api/v1/workspaces
GET    /api/v1/workspaces/{id}
POST   /api/v1/workspaces/{id}/invites
POST   /api/v1/workspaces/{id}/invites/{token}/accept
GET    /api/v1/workspaces/{id}/members
PATCH  /api/v1/workspaces/{id}/members/{userId}
DELETE /api/v1/workspaces/{id}/members/{userId}
```

### Clerk Webhook Events Handled

- `user.created` → create `users` row.
- `user.updated` → update profile.
- `organization.created` → create `workspaces` row.
- `organization.updated` → update workspace name.
- `organizationMembership.created` → create membership.
- `organizationMembership.updated` → update role.
- `organizationMembership.deleted` → delete membership.

## 4. Workflow Service (`services/workflow-service`)

### Owned Tables (schema: `workflow`)

```sql
workflows
  id uuid pk
  workspace_id uuid
  created_by uuid
  name text
  description text
  is_public boolean default false
  source_workflow_id uuid nullable   -- for remix/fork tracking
  nodes jsonb          -- normalized later if needed
  edges jsonb
  variables jsonb
  created_at timestamp
  updated_at timestamp
  version integer default 1

workflow_versions
  id uuid pk
  workflow_id uuid fk workflows
  version_number integer
  snapshot jsonb
  created_by uuid
  created_at timestamp

workflow_nodes           -- optional normalized storage
  id uuid pk
  workflow_id uuid
  type text              -- 'start' | 'prompt' | 'decision' | 'output'
  label text
  position_x float
  position_y float
  config jsonb
  created_at timestamp

workflow_edges
  id uuid pk
  workflow_id uuid
  source_id uuid
  target_id uuid
  condition text nullable

comments
  id uuid pk
  workflow_id uuid
  author_id uuid
  content text
  created_at timestamp

templates
  id uuid pk
  name text
  description text
  category text
  workflow_snapshot jsonb
  is_official boolean
  created_at timestamp
```

### API Endpoints

```
GET    /api/v1/workflows
POST   /api/v1/workflows
GET    /api/v1/workflows/{id}
PATCH  /api/v1/workflows/{id}
DELETE /api/v1/workflows/{id}
POST   /api/v1/workflows/{id}/versions
GET    /api/v1/workflows/{id}/versions
POST   /api/v1/workflows/{id}/fork
POST   /api/v1/workflows/{id}/publish
POST   /api/v1/workflows/{id}/unpublish
POST   /api/v1/workflows/{id}/comments
GET    /api/v1/workflows/{id}/comments
GET    /api/v1/templates
GET    /api/v1/templates/{id}
POST   /api/v1/templates/{id}/apply
```

### Node Types

| Type | Config |
|---|---|
| `start` | input variable definitions |
| `prompt` | model_key, system_message, user_message, temperature, max_tokens |
| `decision` | condition expression, true/false edges |
| `output` | display format (markdown, json, text) |

### Remix / Fork Flow

1. `POST /workflows/{id}/fork` with `target_workspace_id`.
2. Service copies the workflow snapshot.
3. Sets `source_workflow_id` to original.
4. Publishes `workflow.forked` event.

## 5. Execution Service (`services/execution-service`)

### Owned Tables (schema: `execution`)

```sql
executions
  id uuid pk
  workflow_id uuid
  workspace_id uuid
  triggered_by uuid
  status text             -- 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
  input_context jsonb
  output_context jsonb
  started_at timestamp
  finished_at timestamp
  cost_estimate_usd decimal
  latency_ms integer

execution_steps
  id uuid pk
  execution_id uuid
  node_id text
  node_type text
  status text
  input_snapshot jsonb
  output_snapshot jsonb
  error_message text
  latency_ms integer
  cost_estimate_usd decimal
  created_at timestamp
  updated_at timestamp
```

### API Endpoints

```
POST   /api/v1/executions                # start execution
GET    /api/v1/executions                # list by workspace
GET    /api/v1/executions/{id}           # execution details
GET    /api/v1/executions/{id}/stream    # SSE progress
POST   /api/v1/executions/{id}/cancel
```

### Execution Engine

```
1. Receive execution request.
2. Build DAG from workflow nodes/edges.
3. Topologically sort or BFS from start node.
4. For each node:
   a. Resolve variables from input/output context.
   b. If prompt node: call AI provider.
   c. If decision node: evaluate condition.
   d. If output node: format result.
   e. Persist step result.
5. Mark execution complete/failed.
6. Publish `execution.completed` event.
```

### AI Provider Abstraction

```python
class AIProvider(Protocol):
    async def chat(
        self,
        model_key: str,
        messages: list[Message],
        temperature: float,
        max_tokens: int | None,
    ) -> ChatResponse: ...

class OpenAIProvider(AIProvider): ...
class AnthropicProvider(AIProvider): ...
```

Provider registry maps `model_key` (e.g. `openai/gpt-4o`, `anthropic/claude-3-5-sonnet`) to provider instance.

### Retry Strategy

- Exponential backoff: 1s, 2s, 4s.
- Max 3 retries per provider call.
- Circuit breaker after 5 consecutive failures (optional MVP).

### Result Streaming

Execution service keeps an in-memory or Redis-backed stream channel. Client opens SSE to `/executions/{id}/stream`; service pushes step updates.

## 6. Billing Service (`services/billing-service`)

### Owned Tables (schema: `billing`)

```sql
subscriptions
  id uuid pk
  workspace_id uuid
  stripe_customer_id text
  stripe_subscription_id text
  plan text              -- 'pro'
  status text            -- 'active' | 'trialing' | 'past_due' | 'cancelled'
  current_period_end timestamp
  created_at timestamp
  updated_at timestamp

usage_records
  id uuid pk
  workspace_id uuid
  metric text            -- 'executions' | 'ai_tokens'
  value integer
  recorded_at timestamp
```

### API Endpoints

```
GET    /api/v1/billing/subscription
POST   /api/v1/billing/checkout          # create Stripe checkout
POST   /api/v1/billing/portal            # Stripe customer portal
POST   /api/v1/billing/webhooks/stripe
GET    /api/v1/billing/usage
```

### Webhook Events

- `checkout.session.completed` → create subscription.
- `invoice.payment_succeeded` → update period end.
- `customer.subscription.updated` → update status.
- `customer.subscription.deleted` → mark cancelled.

## 7. Notification Service (`services/notification-service`)

### Responsibilities
- Listen to Redis events and send transactional emails.
- Send workspace invitation emails.
- Forward webhooks if needed.

### Tables (schema: `notification`)

```sql
notifications
  id uuid pk
  user_id uuid
  type text
  title text
  body text
  read boolean
  created_at timestamp
```

### Events Consumed

- `workspace.invite_accepted`
- `execution.completed`
- `workflow.forked`

## 8. Shared Events Schema

All events use a common envelope:

```json
{
  "event_id": "uuid",
  "event_type": "user.created",
  "payload": { ... },
  "timestamp": "2026-07-19T12:00:00Z"
}
```

Event types:

- `user.created`
- `workspace.invite_accepted`
- `workflow.forked`
- `execution.started`
- `execution.step_completed`
- `execution.completed`
- `subscription.updated`

## 9. Frontend (`apps/web`)

### Routes

```
/                          marketing landing
/login                     Clerk sign-in
/sign-up                 Clerk sign-up
/app                       dashboard
/app/w/:id                 workspace home
/app/w/:id/workflows       workflow list
/app/w/:id/workflows/new   create workflow
/app/w/:id/workflows/:wfId   builder
/app/w/:id/workflows/:wfId/runs  execution history
/app/w/:id/settings        workspace settings
/templates                 public template gallery
```

### Key Components

- `WorkflowCanvas` — React Flow wrapper.
- `PromptNode`, `DecisionNode`, `OutputNode`, `StartNode` — custom nodes.
- `VariablePanel` — define workflow inputs.
- `RunPanel` — input values and run button.
- `ExecutionTimeline` — step outputs.
- `ShareDialog` — public/private toggle + invite.

### API Client

- `apiClient` wraps `fetch` with Clerk token injection and base URL.
- TanStack Query hooks live in `src/hooks/`.

## 10. Error Handling

Every service returns RFC 7807 `Problem Details`:

```json
{
  "type": "https://chainchat.io/errors/not-found",
  "title": "Workflow not found",
  "status": 404,
  "detail": "Workflow id=... does not exist or you lack access.",
  "instance": "/api/v1/workflows/..."
}
```

Global exception handlers catch:
- `ValidationError` → 422
- `NotFoundError` → 404
- `ForbiddenError` → 403
- `UnauthorizedError` → 401
- `ConflictError` → 409
- All others → 500 with Sentry capture

## 11. Rate Limiting

- Per-user: 1000 requests / hour.
- Per-workspace: 100 AI executions / hour (billing-enforced later).
- AI execution: 10 concurrent executions / workspace.

## 12. Database Per Service

Each service has its own Alembic migration history and connects to a schema inside a shared RDS PostgreSQL instance. Example connection strings:

```
auth-service:      postgresql://.../chainchat?options=-c%20search_path=auth
workflow-service:  postgresql://.../chainchat?options=-c%20search_path=workflow
execution-service: postgresql://.../chainchat?options=-c%20search_path=execution
billing-service:   postgresql://.../chainchat?options=-c%20search_path=billing
```

## 13. Local Development

`docker-compose.yml` spins up:
- PostgreSQL 16
- Redis 7
- Gateway + all services (hot-reload with uvicorn)
- Frontend Vite dev server

Each Python service uses its own `.venv` locally. `Makefile` provides:

```
make venv          # create all .venvs
make install       # install all deps
make dev           # docker-compose up
make test          # run all test suites
make lint          # ruff + mypy
make migrate       # run Alembic migrations
```

## 14. OpenAPI

Each FastAPI service exposes auto-generated OpenAPI docs at `/docs`. The gateway can aggregate them under `/api/v1/docs/{service}` or a unified spec can be generated at build time.

## 15. Testing Strategy

| Layer | Tool |
|---|---|
| Backend unit | pytest + pytest-asyncio + factory-boy |
| Backend integration | Testcontainers (Postgres/Redis) |
| Frontend unit | Vitest + React Testing Library |
| Frontend E2E | Playwright |
| API contract | schemathesis (optional) |

## 16. Observability

- `structlog` for JSON logs in every service.
- Request ID propagated via `x-request-id` header.
- Sentry for exception tracking.
- CloudWatch logs/metrics.
- Custom metrics: `execution_duration_ms`, `ai_request_latency`, `workflow_forks`.
