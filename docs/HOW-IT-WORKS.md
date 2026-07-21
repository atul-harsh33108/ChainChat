# How ChainChat Actually Works

This document describes how ChainChat behaves **as implemented in the code today**, not
as it is envisioned in `HLD.md` and `LLD.md`. Where the running code diverges from the
design documents, this file follows the code and calls out the gap. It is meant as the
honest "ground truth" companion to the aspirational design docs.

> TL;DR — The skeleton is real and runnable: a React SPA talks to a FastAPI gateway, the
> gateway proxies to six services, and the **workflow** and **execution** services are
> genuinely implemented (real database CRUD and a real DAG execution engine that calls
> live LLMs through OpenRouter). Several other pieces — the auth service, notifications,
> Clerk webhook sync, and parts of billing — are still placeholders, and the frontend's
> "run a workflow" path is not yet wired to the execution API's real contract.

---

## 1. The Big Picture

ChainChat is a team tool for building and running multi-step AI prompt chains. The
system is split into a single-page frontend and a set of FastAPI microservices that sit
behind one gateway.

```
Browser (React + Vite SPA, Clerk auth)
        │  HTTPS/JSON, Authorization: Bearer <clerk-token>
        ▼
Gateway  (:8000)  — validates token, injects identity headers, proxies by path prefix
        │
        ├── /api/v1/auth|users|workspaces   ──▶ auth-service        (:8001)  [mostly stub]
        ├── /api/v1/workflows|templates      ──▶ workflow-service    (:8002)  [real CRUD]
        ├── /api/v1/executions               ──▶ execution-service   (:8003)  [real engine]
        ├── /api/v1/billing                  ──▶ billing-service     (:8004)  [real Stripe + fallback]
        └── /api/v1/notifications            ──▶ notification-service(:8005)  [real CRUD, no triggers]
                                                     │
                                                     ▼
                                    PostgreSQL (per-service schema) + Redis (execution queue only)
```

Every service exposes `/api/v1/health` and its own auto-generated OpenAPI docs at `/docs`.

---

## 2. Request Lifecycle: From Click to Response

1. **The SPA loads** (`apps/web/src/main.tsx`). It is wrapped in Clerk's `ClerkProvider`
   using `VITE_CLERK_PUBLISHABLE_KEY`, then in a `TokenSync` component.
2. **Token sync** (`components/auth/TokenSync.tsx`). Once a user is signed in, `TokenSync`
   calls Clerk's `getToken()` and stores the JWT in `localStorage['clerk-token']`. It
   refreshes that token every 5 minutes and clears it on sign-out.
3. **API calls** (`lib/api.ts`). An axios instance points at `VITE_API_URL`
   (default `http://localhost:8000`). A request interceptor attaches
   `Authorization: Bearer <clerk-token>` to every call. A response interceptor watches for
   `401` — on which it clears the token and redirects to `/login`.
4. **The gateway receives the request** (`services/gateway/src/gateway/main.py`) and does
   three things: validates the token, injects identity headers, and proxies to the right
   upstream service (see next section).
5. **The upstream service** handles the request against its own PostgreSQL schema and
   returns JSON, which the gateway passes back verbatim to the browser.

---

## 3. The Gateway — Auth and Routing

The gateway is a single file and is the most load-bearing part of the backend.

### Routing
A `SERVICE_MAP` maps the **first path segment** after `/api/v1/` to an upstream base URL:

| Path prefix | Upstream service |
|---|---|
| `auth`, `users`, `workspaces` | auth-service |
| `workflows`, `templates` | workflow-service |
| `executions` | execution-service |
| `billing` | billing-service |
| `notifications` | notification-service |

A catch-all route `@app.api_route("/api/v1/{path:path}")` forwards the method, body,
query params, and headers through a shared `httpx.AsyncClient`, strips the `host` header,
and returns the upstream response unchanged. If the upstream is unreachable it returns
`503`. Unknown prefixes return `404`.

### Token validation (important nuance)
`validate_token()` behaves in **two modes**:

- **Production mode** — only when `CLERK_JWKS_URL` is set (and does not contain the word
  `placeholder`). The token is verified with `jwt.decode(..., algorithms=["RS256"],
  audience="chainchat")` against Clerk's JWKS.
- **Development bypass (the default)** — the config default for `clerk_jwks_url` is an
  empty string, so out of the box the gateway calls `jwt.get_unverified_claims(token)`.
  This decodes the JWT **without verifying its signature**. Any well-formed JWT is
  accepted. This is fine for local development but is a real security consideration to be
  aware of before deploying.

On success the gateway extracts claims and injects three headers into the upstream
request, which every downstream service relies on for identity:

- `x-user-id`   ← `sub`
- `x-workspace-id` ← `org_id`
- `x-role`      ← `org_role`

Requests whose path begins with `webhooks/` **skip authentication entirely** so external
providers (e.g. Stripe) can post directly.

---

## 4. Service-by-Service Reality Check

### 4.1 auth-service (`:8001`) — mostly stubbed
The service defines full SQLAlchemy models (`User`, `Workspace`, `Membership`,
`AuditLog` in the `auth` schema) **but the routers don't use them yet**:

- `GET /api/v1/users/me` returns a hardcoded "Demo User" built from the `x-user-id`
  header — no database query.
- `GET /api/v1/workspaces` returns `[]`; `POST` returns a hardcoded "Demo Workspace".
- `POST /api/v1/webhooks/clerk` is a no-op that returns `{"received": true}` — there is
  **no Clerk signature check and no user/org sync**. The LLD's described webhook-driven
  provisioning is not implemented.

Practical effect: identity comes from Clerk on the frontend and from JWT claims at the
gateway, but the backend does not yet persist users, workspaces, or memberships.

### 4.2 workflow-service (`:8002`) — fully implemented
This is a genuine, working service backed by the `workflow` schema (`Workflow`,
`WorkflowVersion`, `WorkflowNode`, `WorkflowEdge`, `Comment`, `Template`).

- Async CRUD for workflows: list (optional `workspace_id` filter), create, get, patch,
  delete. All write endpoints require the `x-user-id` header (else `401`).
- `POST /workflows/{id}/fork` deep-copies a workflow — including its versions, nodes, and
  edges — remapping IDs and tracking the parent for remix lineage.
- Versioning: `POST /workflows/{id}/versions` auto-increments `version_number`;
  `GET .../versions` lists history.
- Templates: list (optional `category`), get, and `POST /templates/{id}/apply`, which
  creates a new `Workflow` plus an initial `WorkflowVersion` from the template's stored
  graph.

### 4.3 execution-service (`:8003`) — real DAG engine, real LLM calls
This is the heart of the product and it is genuinely implemented across three files:
`engine.py`, `ai.py`, and `routers/executions.py`.

**Data model** (`execution` schema): an `Execution` (with `workspace_id`, `chain_id`,
`status`, `input_payload`, `output_payload`) owns many `ExecutionStep` rows (`step_key`,
`depends_on`, `provider`, `model_key`, `prompt`, `inputs`, `outputs`, `status`,
`retry_count`).

**Creating an execution** — `POST /api/v1/executions` accepts an `ExecutionCreate`:

```jsonc
{
  "workspace_id": "<uuid>",
  "chain_id": "<uuid>",
  "input_payload": { "topic": "..." },
  "steps": [
    { "step_key": "draft", "depends_on": [], "provider": "openrouter",
      "model_key": "google/gemma-4-31b-it:free", "prompt": "Write about {topic}",
      "inputs": {} }
  ]
}
```

The endpoint persists the execution + steps, then enqueues the job on Redis.

**The engine** (`engine.py`):
1. `enqueue_execution()` pushes the job onto an RQ queue named `execution`
   (`Redis.from_url(settings.redis_url)`). An RQ worker picks it up and runs
   `run_execution_sync`, which is an `asyncio.run` wrapper around `run_execution`.
2. `_topological_steps()` runs **Kahn's algorithm** over each step's `depends_on` list to
   produce a valid execution order. It raises on unknown dependencies or cycles.
3. Steps run in dependency order. Each step's output is written into a shared `context`
   dict keyed by `step_key`, so later steps can reference earlier results. The prompt is
   rendered with Python's `str.format(**variables)`, where `variables` merges the step's
   own `inputs` with the accumulated `context`.
4. `_run_step_with_retries()` retries a failing step up to `max_retries` (default 2) with
   linear backoff (`sleep(1 * (attempt + 1))`).
5. **Cancellation** is cooperative: before each step (and each retry) the engine re-reads
   the execution row and stops if `status == "cancelled"`.
6. On completion the whole `context` is saved to `output_payload` and status becomes
   `completed` / `failed` / `cancelled`.

**The AI layer** (`ai.py`) — this is a real network call, not a stub, but with an
important simplification versus the design docs:

- There is a **single** `OpenRouterProvider` that posts to OpenRouter's
  OpenAI-compatible endpoint `https://openrouter.ai/api/v1/chat/completions`.
- The provider registry maps **every** provider key (`openrouter`, `openai`, `anthropic`,
  `google`, `nvidia`) to that same `OpenRouterProvider`. So despite the design doc's
  talk of separate OpenAI and Anthropic SDK integrations, in practice **all model calls
  are proxied through OpenRouter**. The specific model is chosen per step via `model_key`.
- The API key is read from `settings.openai_api_key` — i.e. you set `OPENAI_API_KEY` to
  your **OpenRouter** key. Without a key, calls will fail at OpenRouter with `401`.
- The default model is `google/gemma-4-31b-it:free`. (The code itself notes these IDs may
  need verifying against the live OpenRouter catalogue.)

**Live progress** — `GET /api/v1/executions/{id}/stream` is a Server-Sent Events endpoint.
Note it does **not** use Redis pub/sub: it simply **polls the database once per second**
and emits `status` / `done` events when the execution's status or step count changes.
`POST /api/v1/executions/{id}/cancel` flips the status to `cancelled` (rejected with `409`
once terminal). The list endpoint (`GET /api/v1/executions`) supports `limit`/`offset`
but does **not** filter by workflow.

### 4.4 billing-service (`:8004`) — real Stripe with placeholder fallbacks
The billing routes call the real Stripe SDK **only when keys are configured**, and fall
back to placeholders otherwise:

- `GET /billing/subscription` looks up the subscription by `x-workspace-id`. With no row
  and no Stripe key, it returns a hardcoded free-plan object; with a key set it returns
  `404`.
- `POST /billing/checkout` creates a real `stripe.checkout.Session` when both
  `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are set; otherwise it returns a fake
  `{"session_id": "cs_placeholder", ...}`.
- `POST /billing/portal` calls the real Stripe portal API but with a **hardcoded
  `customer="cus_placeholder"`**, which would fail against real Stripe — so this path is
  effectively a placeholder.
- `POST /billing/webhooks/stripe` verifies the signature only if `STRIPE_WEBHOOK_SECRET`
  is set, and in all cases returns `{"received": true}` **without acting on any event** —
  there is no subscription state machine yet.
- `GET /billing/usage` returns real `UsageRecord` rows for the workspace.

### 4.5 notification-service (`:8005`) — real CRUD, but nothing triggers it
Real database CRUD exists (`GET /notifications`, `POST /notifications/{id}/read`,
`POST /notifications/send`). However **no other service publishes events to it** — there
is no Redis pub/sub subscriber. Notifications are only created when something explicitly
calls `/send`. The event-driven emails described in the design docs are not wired up.

---

## 5. Events and Redis — What's Real

The design docs describe a rich Redis pub/sub event bus (`user.created`,
`execution.completed`, etc.). **In the running code, no pub/sub layer exists.** Redis is
configured in every service's settings but is only actually used by the
execution-service, and only as an **RQ job queue**. Cross-service, event-driven behavior
(notifications on completion, forks, subscription updates) is not implemented — live
execution updates reach the browser through the DB-polling SSE endpoint instead.

---

## 6. The Frontend

**Stack**: React 18 + Vite + TypeScript, React Router, TanStack Query, Zustand, Tailwind
+ shadcn/ui, and Clerk for auth.

**Routing** (`App.tsx`):
- Public: `/` (landing), `/login`, `/sign-up`, `/templates`.
- Protected `/app/*` behind a `ProtectedRoute` that uses Clerk's `<SignedIn>/<SignedOut>`
  (redirecting signed-out users to `/login`), rendered inside `AppLayout`. Nested routes
  cover the dashboard, workflow list, workflow builder (`/new` and `/:workflowId`), the
  runs view, and workspace settings.

**Pages**:
- **landing** — marketing page (the `$12/month` pitch).
- **dashboard** — uses Clerk's `useOrganization`; currently shows static cards and an
  empty "No workflows yet" state.
- **workflow-list** — lists workflows via `useWorkflows`; "create" seeds a starter graph
  (a start node + a prompt node).
- **workflow-builder** — a React Flow canvas where you add prompt/decision/output nodes
  and Save via create/update. The **Run button is currently disabled / has no handler**.
- **workflow-runs** — lists executions and tries to show cost/latency fields (which the
  backend does not currently populate).
- **settings** — Clerk org management; the billing tab explicitly states it returns
  placeholder data.
- **templates** — a gallery via `useTemplates`; "Use template" navigates to the builder
  with a `?template=` query param but is **not** wired to the real `/templates/{id}/apply`
  endpoint.

**Data hooks** (`hooks/workflows.ts`): TanStack Query wrappers — `useWorkflows`,
`useWorkflow`, `useCreateWorkflow`, `useUpdateWorkflow`, `useTemplates`, `useExecutions`,
`useRunWorkflow`. **State** (`stores/workspace.ts`): a small persisted Zustand store
holding `currentWorkspaceId`.

---

## 7. Known Gaps Between Frontend and Backend

These are the seams to be aware of when picking up the project:

1. **Run-workflow contract mismatch.** `useRunWorkflow` POSTs
   `{ workflow_id, input_context }`, but the execution API expects
   `{ workspace_id, chain_id, input_payload, steps: [...] }`. As wired today, kicking off
   a run from the UI would not satisfy the backend schema — the builder's Run button is
   disabled, consistent with this being unfinished.
2. **List filter ignored.** `useExecutions` sends `?workflow_id=`, but the backend list
   endpoint ignores it and returns the most recent executions across the board.
3. **Casing / shape mismatch.** Frontend types are camelCase (`workspaceId`, `isPublic`,
   `nodes`, `edges`, `variables`) while the backend returns snake_case and a different
   `Workflow` shape.
4. **Auth data is demo-only.** `users/me` and `workspaces` return hardcoded values, so the
   frontend's real identity comes from Clerk rather than the backend.

None of these break the app's ability to start and navigate; they mark where the
"execute a chain end-to-end from the UI" flow still needs to be connected.

---

## 8. What Runs Today vs. What's Designed

| Capability | Design docs | Actual code |
|---|---|---|
| Gateway routing + JWT | Full Clerk JWKS verification | Real routing; JWKS verify **only if configured**, else unverified dev bypass |
| User/workspace persistence | Clerk-webhook driven sync into DB | **Stubbed** — hardcoded demo data, webhook is a no-op |
| Workflow CRUD / versions / fork / templates | Full | **Fully implemented** |
| Execution engine (DAG, retries, cancel) | Full | **Fully implemented** |
| AI providers | Separate OpenAI + Anthropic SDKs | **All routed through OpenRouter** via one provider |
| Live execution updates | Redis pub/sub + SSE | SSE that **polls the database** every 1s |
| Cross-service events / notifications | Redis pub/sub bus | **Not implemented** — no subscribers |
| Billing | Full Stripe lifecycle | Real Stripe calls **with placeholder fallbacks**; webhooks not acted on |
| Frontend run-a-workflow flow | Full | **Not yet wired** to execution API contract |

---

## 9. Running It Locally

```bash
make venv      # create per-service virtualenvs
make install   # install Python + Node deps
make dev       # docker-compose: Postgres, Redis, all services, Vite
```

Then open http://localhost:5173. The gateway is at http://localhost:8000. To exercise a
real AI run, set `OPENAI_API_KEY` (to an OpenRouter key) in the execution-service
environment and ensure an RQ worker is consuming the `execution` queue; then create an
execution directly against `POST /api/v1/executions` with the payload shape shown in
section 4.3. For deployment and operations, see `RUNBOOK.md`.
