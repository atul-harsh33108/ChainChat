# How ChainChat Actually Works

This document describes how ChainChat behaves **as implemented in the code today**, not
as it is envisioned in `HLD.md` and `LLD.md`. Where the running code diverges from the
design documents, this file follows the code and calls out the gap. It is meant as the
honest "ground truth" companion to the aspirational design docs.

> **Last verified:** 2026-08-06 on branch `test-v2-30-7` (HEAD `e1f95fe`) — every service
> was read and the frontend/backend test, lint, and type suites were executed. See
> [`docs/audit/AUDIT.md`](audit/AUDIT.md) for the full findings and
> [`docs/audit/PROGRESS.md`](audit/PROGRESS.md) for live fix status.

> TL;DR — The skeleton is real and runnable: a React SPA talks to a FastAPI gateway, the
> gateway proxies to six services, and the **workflow** and **execution** services are
> genuinely implemented (real database CRUD and a real DAG execution engine that calls
> live LLMs through OpenRouter) **and are wired end-to-end from the UI** — you can build,
> save, run, and remix a prompt chain from the browser and watch it execute. The
> **auth-service** persists users via just-in-time Clerk sync and hosts a working **admin
> console** (user directory + time-limited Pro grants). Still placeholder or missing:
> workspace CRUD, Clerk/Stripe webhook handlers (routing fixed in P1; handlers still no-ops),
> notification triggers, billing's subscription state machine, plan enforcement, and all
> authorization (RBAC) checks.

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
        ├── /api/v1/auth|users|workspaces|admin ─▶ auth-service        (:8001)  [users+admin real; workspaces stub]
        ├── /api/v1/workflows|templates          ─▶ workflow-service    (:8002)  [real CRUD]
        ├── /api/v1/executions                   ─▶ execution-service   (:8003)  [real engine]
        ├── /api/v1/billing                      ─▶ billing-service     (:8004)  [real Stripe + fallback]
        └── /api/v1/notifications                ─▶ notification-service(:8005)  [real CRUD, no triggers]
                                                         │
                                                         ▼
                                        PostgreSQL (per-service schema) + Redis (execution queue only)
```

Every service exposes `/api/v1/health` and its own auto-generated OpenAPI docs at `/docs`.

---

## 2. Request Lifecycle: From Click to Response

1. **The SPA loads** (`apps/web/src/main.tsx`). The tree is: `ErrorBoundary` →
   `BrowserRouter` → `ClerkProvider` (using `VITE_CLERK_PUBLISHABLE_KEY`, wired to React
   Router navigation so multi-step auth flows don't lose the URL) → `TokenSync` → `App`.
2. **Token sync** (`components/auth/TokenSync.tsx`). `TokenSync` registers a *token
   provider* with the API client so every request pulls a fresh token straight from
   Clerk (`getToken()`), and keeps a cached copy in `localStorage['clerk-token']`
   (refreshed every 5 minutes, cleared on sign-out) as a fallback for when Clerk is
   slow to initialise.
3. **API calls** (`lib/api.ts`). An axios instance points at `VITE_API_URL` (default
   `http://localhost:8000`). A request interceptor attaches `Authorization: Bearer
   <token>`. On `401` it only clears the cached token — deliberately no hard redirect:
   Clerk's `<SignedIn>/<SignedOut>` guards already handle unauthenticated users, and a
   redirect would interrupt in-progress auth flows whenever a request races the token.
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
| `auth`, `users`, `workspaces`, `admin` | auth-service |
| `workflows`, `templates` | workflow-service |
| `executions` | execution-service |
| `billing` | billing-service |
| `notifications` | notification-service |

A catch-all route `@app.api_route("/api/v1/{path:path}")` forwards the method, body,
query params, and headers through a shared `httpx.AsyncClient`, strips the `host` header,
and returns the upstream response unchanged. If the upstream is unreachable it returns
`503`. Unknown prefixes return `404`.

⚠️ **`webhooks` is not in `SERVICE_MAP`**, so webhook calls through the gateway are
broken — see §7, item 1.

### Token validation (important nuance)

`validate_token()` behaves in **two modes**:

- **Production mode** — only when `CLERK_JWKS_URL` is set (and does not contain the word
  `placeholder`). The token is verified with `jwt.decode(..., algorithms=["RS256"],
  audience="chainchat")` against Clerk's JWKS.
- **Development bypass (the default)** — the config default for `clerk_jwks_url` is an
  empty string, so out of the box the gateway calls `jwt.get_unverified_claims(token)`.
  This decodes the JWT **without verifying its signature**. Any well-formed JWT is
  accepted. Fine for local development; a real security consideration before deploying
  (tracked as FEAT-04 in the audit).

On success the gateway extracts claims and injects three headers into the upstream
request, which every downstream service relies on for identity:

- `x-user-id`   ← `sub`
- `x-workspace-id` ← `org_id`
- `x-role`      ← `org_role`

Downstream, `x-user-id` is required by all write endpoints (and `x-workspace-id` is read
by billing/notifications), but **no service reads `x-role`** — there is no authorization
enforcement yet (§7, item 6).

Requests whose path begins with `webhooks/` are *intended* to skip authentication so
external providers (Clerk, Stripe) can post directly — but the implementation is broken
for real webhook paths; see §7, item 1.
---

## 4. Service-by-Service Reality Check

### 4.1 auth-service (`:8001`) — users + admin real, workspaces stubbed

The service defines full SQLAlchemy models (`User`, `Workspace`, `Membership`,
`ProGrant`, `AuditLog` in the `auth` schema). What the routers actually do:

- `GET /api/v1/users/me` — **real**. Because Clerk webhooks aren't reachable in local
  development, the local user mirror is refreshed *just-in-time* from the authenticated
  request: `entitlements.sync_user_from_clerk()` fetches the user from the Clerk Backend
  API (when `CLERK_SECRET_KEY` is configured) and upserts the `auth.users` row. The
  response adds `is_admin` (caller's email matched against the `ADMIN_EMAILS` env
  allow-list) and the current Pro entitlement (an active, unexpired, unrevoked
  `ProGrant`).
- `GET /api/v1/users/{clerk_id}/entitlement` — **real** plan + expiry lookup built for
  other services. Nothing calls it yet — there is no plan enforcement anywhere (GAP-05).
- `GET /api/v1/admin/users`, `POST /admin/users/{id}/pro`,
  `POST /admin/users/{id}/pro/revoke`, grant history — **real admin console API**. The
  user directory is read live from Clerk and merged with local grant state; grants stack
  by extending the current expiry (never shortening access) and are append-only
  (revoking sets `revoked_at`); every grant/revoke writes an `AuditLog` row.
  Authorization: the caller's Clerk email must be in `ADMIN_EMAILS` — configuration, not
  the database, so admin rights can't be escalated by editing app data.
- `GET /api/v1/workspaces` returns `[]`; `POST` returns a hardcoded "Demo Workspace".
  The `Workspace`/`Membership` models exist but are unused. **Stubbed** (GAP-03).
- `POST /api/v1/webhooks/clerk` is a no-op that returns `{"received": true}` — no Svix
  signature check and no user/org sync (GAP-04). It is also unreachable through the
  gateway (§7.1).

Practical effect: identity comes from Clerk on the frontend and from JWT claims at the
gateway; users are persisted just-in-time; workspaces and memberships are not.

### 4.2 workflow-service (`:8002`) — fully implemented

This is a genuine, working service backed by the `workflow` schema (`Workflow`,
`WorkflowVersion`, `WorkflowNode`, `WorkflowEdge`, `Comment`, `Template`).

- Async CRUD for workflows: list (optional `workspace_id` filter), create, get, patch,
  delete. All write endpoints require the `x-user-id` header (else `401`).
- `POST /workflows/{id}/fork` deep-copies a workflow — including its versions, nodes, and
  edges — remapping IDs and tracking the parent for remix lineage.
- Versioning: `POST /workflows/{id}/versions` auto-increments `version_number` (via
  `max(version_number) + 1`); `GET .../versions` lists history. Graph content lives on
  the version (`WorkflowVersion.graph` JSONB) — every save from the builder creates a new
  immutable version.
- Templates: list (optional `category`), get, and `POST /templates/{id}/apply`, which
  creates a new `Workflow` plus an initial `WorkflowVersion` from the template's stored
  graph. There is **no `POST /templates`** endpoint to create templates (the
  `TemplateCreate` schema exists but is unused), and no publish/unpublish endpoints —
  `published_version_id` is only settable via PATCH (GAP-07).
- `Comment` model + schemas + table exist, but **no comments router is mounted** — the
  API and UI don't exist (GAP-09).
- External (Clerk) string IDs are accepted anywhere a UUID is expected: `ids.to_uuid()`
  maps them to a deterministic UUIDv5, so `org_2xyz…` always resolves to the same
  internal UUID.

### 4.3 execution-service (`:8003`) — real DAG engine, real LLM calls

This is the heart of the product and it is genuinely implemented across three files:
`engine.py`, `ai.py`, and `routers/executions.py`.

**Data model** (`execution` schema): an `Execution` (with `workspace_id`, `chain_id`,
`status`, `input_payload`, `output_payload`) owns many `ExecutionStep` rows (`step_key`,
`depends_on`, `provider`, `model_key`, `prompt`, `inputs`, `outputs`, `status`,
`retry_count`), unique per `(execution_id, step_key)`. Steps are eager-loaded
(`lazy="selectin"`) because lazy loading inside async handlers raises `MissingGreenlet`.

**Creating an execution** — `POST /api/v1/executions` accepts an `ExecutionCreate`:

```jsonc
{
  "workspace_id": "<uuid-or-clerk-org-id>",
  "chain_id": "<workflow-uuid>",
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
   `run_execution_sync`, an `asyncio.run` wrapper around `run_execution`. (No worker =
   executions sit in `pending` forever; compose runs one as `execution-worker`.)
2. `_topological_steps()` runs **Kahn's algorithm** over each step's `depends_on` list to
   produce a valid execution order. It raises on unknown dependencies or cycles.
3. Steps run in dependency order. Each step's output is written into a shared `context`
   dict keyed by `step_key`, so later steps can reference earlier results. The prompt is
   rendered by `_render_prompt()`, a custom regex substitution — **not** `str.format`
   (the code comments explain why: literal braces would raise `ValueError`, missing keys
   `KeyError`, and a prior step's dict output would render as a Python repr; instead,
   `{name}` placeholders resolve from merged `inputs` + `context`, dict values with a
   `text` key unwrap to their text, and unknown placeholders pass through untouched).
4. `_run_step_with_retries()` retries a failing step up to `max_retries` (default 2).
   Backoff (`_retry_delay`) is provider-aware: on HTTP 429 it honours the `Retry-After`
   header (capped at 30s) or backs off exponentially (5s, 10s, 20s…); other errors use
   linear `1s * (attempt + 1)`. `_friendly_error()` turns provider HTTP errors into
   actionable messages (rate limit, bad key, retired model id).
5. **Cancellation** is cooperative: before each step (and each retry) the engine re-reads
   the execution row and stops if `status == "cancelled"`.
6. On completion the whole `context` is saved to `output_payload` and status becomes
   `completed` / `failed` / `cancelled`.
**The AI layer** (`ai.py`) — real network calls, with one simplification versus the
design docs:

- A **single** `OpenRouterProvider` posts to OpenRouter's OpenAI-compatible endpoint
  `https://openrouter.ai/api/v1/chat/completions`.
- The registry maps **every** provider key (`openrouter`, `openai`, `anthropic`,
  `google`, `nvidia`) to that same provider — all model calls go through OpenRouter; the
  model is chosen per step via `model_key`.
- The API key is read from `settings.openai_api_key` — set `OPENAI_API_KEY` to your
  **OpenRouter** key. Without a key, calls fail with `401`.
- Default model `google/gemma-4-31b-it:free` (the code notes IDs may need verifying
  against the live OpenRouter catalogue).

**Live progress** — `GET /api/v1/executions/{id}/stream` is a Server-Sent Events
endpoint. It does **not** use Redis pub/sub: it polls the database once per second (with
a fresh session per poll, so worker writes are visible) and emits `status` / `done`
events when status or step count changes. `POST /api/v1/executions/{id}/cancel` flips
the status to `cancelled` (`409` once terminal). The list endpoint supports `chain_id`,
`workspace_id`, `limit`, and `offset` filters. (The frontend doesn't use the SSE
endpoint — it polls `GET /executions/{id}` instead; see §6.)

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
  `customer="cus_placeholder"`**, which would fail against real Stripe (BUG-06).
- `POST /billing/webhooks/stripe` verifies the signature only if `STRIPE_WEBHOOK_SECRET`
  is set, and in all cases returns `{"received": true}` **without acting on any event** —
  there is no subscription state machine yet (GAP-01). Through the gateway this path
  currently returns 401 (§7.1).
- `GET /billing/usage` returns real `UsageRecord` rows for the workspace — but nothing
  ever writes them (GAP-06).
- Frontend: the settings billing tab buttons have no handlers (BUG-06).

### 4.5 notification-service (`:8005`) — real CRUD, but nothing triggers it

Real database CRUD exists (`GET /notifications` with user/workspace/read filters,
`POST /notifications/{id}/read`, `POST /notifications/send`). A `NotificationTemplate`
model exists but has no API. **No other service publishes to it** — there is no event
bus, no email channel, and the frontend has no notifications UI (GAP-02).

---

## 5. Events and Redis — What's Real

The design docs describe a rich Redis pub/sub event bus (`user.created`,
`execution.completed`, etc.). **In the running code, no pub/sub layer exists.** Redis is
configured in every service's settings but is only actually used by the
execution-service, and only as an **RQ job queue**. Cross-service, event-driven behavior
(notifications on completion, forks, subscription updates) is not implemented (FEAT-02).

---

## 6. The Frontend

**Stack**: React 19 + Vite + TypeScript, React Router 7, TanStack Query, Zustand,
Tailwind + shadcn/ui, React Flow, and Clerk for auth.

**Routing** (`App.tsx`):
- Public: `/` (landing), `/login/*`, `/sign-up/*` (splats are required for Clerk's
  multi-step URLs like `/sign-up/verify-email-address`), `/templates`.
- Protected `/app/*` behind a `ProtectedRoute` using Clerk's `<SignedIn>/<SignedOut>`,
  rendered inside `AppLayout`. Nested routes: dashboard (`/app` and
  `/app/w/:workspaceId`), workflow list, builder (`/new` and `/:workflowId`), runs,
  settings, and `/app/admin`.
- A catch-all `*` redirects to `/` so unmatched URLs never render a blank page.
**Pages**:
- **landing** — marketing page (the `$12/month` pitch; mentions cost estimates, which
  aren't implemented — GAP-06).
- **dashboard** — real Clerk org name, real plan badge from `useMe()`, and "Recent
  workflows" lists the 5 most recently updated workflows (fixed 2026-08-06, P3).
- **workflow-list** — real list via `useWorkflows`; create then navigates to the
  builder.
- **workflow-builder** — React Flow canvas with start/prompt/decision/output nodes; Save
  creates a new immutable version; **Run is fully wired**: it saves, converts the graph
  with `graphToSteps()` (only `prompt` nodes execute; dependencies are resolved
  transitively through non-executable nodes; validation errors surface as toasts), posts
  the real `ExecutionCreate` contract, then polls the execution and shows per-step
  status/outputs. Remix (fork) and version badge included. Decision/output nodes are
  cosmetic — their conditions are never evaluated (GAP-08).
- **workflow-runs** — real execution history per workflow (`?chain_id=`), with step
  outputs, retry counts, and status badges.
- **settings** — General (Clerk org info + create org); Members lists real org members
  and invites via `organization.inviteMember` (admins only); Billing wires checkout +
  portal with placeholder-mode toasts and the real plan badge (fixed 2026-08-06, P3).
- **templates** — real gallery via `useTemplates`; "Use template" navigates to
  `/workflows/new?template=<id>`, where the builder applies it via
  `POST /templates/{id}/apply` and opens the created workflow (fixed 2026-08-06, P2).
  Starter templates are seeded with `make seed` (FEAT-06 done).
- **admin** — full admin console UI (search Clerk users, grant/extend/revoke Pro with
  durations and reasons, grant history), hidden unless `useMe().is_admin`; server-side
  authorization is authoritative.

**Data hooks** (`hooks/workflows.ts`, `hooks/admin.ts`): TanStack Query wrappers —
`useWorkflows`, `useWorkflow`, `useCreateWorkflow`, `useUpdateWorkflow`,
`useCreateVersion`, `useForkWorkflow`, `useTemplates`, `useExecutions` (filters by
`chain_id`), `useExecution` (polls every 1.5s while pending/running — polling instead of
the SSE endpoint because `EventSource` can't send the `Authorization` header the gateway
requires), `useRunWorkflow` (real contract), plus `useMe`, `useAdminUsers`,
`useUserGrants`, `useGrantPro`, `useRevokePro`. **State** (`stores/workspace.ts`): a
small persisted Zustand store with `currentWorkspaceId` (largely superseded by route
params + Clerk org state).

---

## 7. Known Gaps Between Frontend and Backend (and other seams)

Previously-listed gaps **now fixed**: the run-workflow contract mismatch (the builder
sends the real `ExecutionCreate`), the ignored executions list filter (`chain_id` is
supported), the camelCase/snake_case type mismatch, and `users/me` demo data (now a real
JIT-synced row). Current seams (audit IDs in brackets — see `docs/audit/AUDIT.md`):

1. ~~**Webhooks are unreachable through the gateway [BUG-01]**~~ — **FIXED 2026-08-06
   (P1):** `webhooks` was added to `SERVICE_MAP` and the auth skip now matches any
   `webhooks` path segment; both webhook routes proxy without a token (covered by
   `services/gateway/tests/test_proxy.py`). The webhook *handlers* are still no-ops —
   see GAP-01/GAP-04.
2. ~~**"Use template" dead end [BUG-05]**~~ — **FIXED 2026-08-06 (P2):** the builder
   reads `?template=`, calls `POST /templates/{id}/apply`, and navigates to the created
   workflow. Seed data ships via `make seed` (FEAT-06).
3. ~~**Frontend placeholders [BUG-06, BUG-07, BUG-08]**~~ — **FIXED 2026-08-06 (P3):**
   dashboard shows real data, billing buttons call checkout/portal (the billing API now
   also coerces Clerk workspace ids instead of 422/500ing), member invites go through
   Clerk. The Stripe portal still uses a placeholder customer server-side (P6).
4. **No plan enforcement [GAP-05].** Pro entitlements are computed and displayed but
   gate nothing; `GET /users/{clerk_id}/entitlement` has no callers.
5. **Decision/output nodes don't execute [GAP-08].** Only `prompt` nodes become steps;
   edge conditions are stored, never evaluated.
6. **No authorization [FEAT-01].** `x-role` is injected but unread; any authenticated
   user can read/modify/delete any workflow or execution. The header-trust model is fine
   only while the gateway is the sole public entry point.
7. **CI is currently red [BUG-02, BUG-03, BUG-04].** ESLint errors, Prettier drift (31
   files), and mypy fails the way `ci.yml` invokes it. CI only runs on `main`, so this
   branch never surfaced it.
8. **JWT verification is opt-in [FEAT-04].** Default is unverified decode — must be
   configured (and made fail-closed) before any real deployment.

---

## 8. What Runs Today vs. What's Designed

| Capability | Design docs | Actual code |
|---|---|---|
| Gateway routing + JWT | Full Clerk JWKS verification | Real routing; JWKS verify **only if configured**, else unverified dev bypass |
| User persistence | Clerk-webhook driven sync into DB | Real, via just-in-time sync on `users/me`; webhook handler is a no-op (routing fixed in P1) |
| Workspace/membership persistence | Full | **Stubbed** (`[]` / demo workspace) |
| Admin console | Not in original design | **Fully implemented** (user directory, time-limited Pro grants, audit log) |
| Workflow CRUD / versions / fork / templates | Full | **Fully implemented** (no publish/unpublish or template-create endpoints) |
| Execution engine (DAG, retries, cancel) | Full | **Fully implemented** |
| AI providers | Separate OpenAI + Anthropic SDKs | **All routed through OpenRouter** via one provider |
| Frontend run-a-workflow flow | Full | **Fully wired** (build → save → run → poll → results) |
| Live execution updates | Redis pub/sub + SSE | SSE that **polls the database**; frontend polls REST instead |
| Cross-service events / notifications | Redis pub/sub bus | **Not implemented** — no publishers/subscribers |
| Billing | Full Stripe lifecycle | Real Stripe calls **with placeholder fallbacks**; webhooks not acted on; dead UI buttons |
| Plan enforcement / usage metering | Plan limits, usage records | **Not implemented** (entitlements computed but unused; usage table never written) |
| Comments | Full | Model/schemas/migration only — **no API, no UI** |
| RBAC | Role-based access | **Not implemented** — `x-role` unread |
| Rate limiting | Per user + workspace at gateway | **Not implemented** |
| Test coverage | >70% on execution engine | Health-check tests only + 1 frontend test |

---

## 9. Running It Locally

```bash
make venv      # create per-service virtualenvs
make install   # install Python + Node deps
make dev       # docker-compose: Postgres, Redis, all services, Vite, and the RQ worker
```

Then open http://localhost:5173. The gateway is at http://localhost:8000.

Notes:
- The `execution-worker` compose service runs `rq worker execution`; without it,
  executions stay `pending` forever.
- To exercise a real AI run, set `OPENAI_API_KEY` (to an OpenRouter key) for the
  execution-service and worker.
- **Windows gotcha [BUG-09]:** pydantic-settings prefers real environment variables over
  each service's `.env` file. If your machine globally exports `DATABASE_URL` /
  `REDIS_URL` (e.g. from another project), local runs and `pytest` will silently use
  them — clear them first (`$env:DATABASE_URL=$null; $env:REDIS_URL=$null` in
  PowerShell).
- For deployment and operations, see `RUNBOOK.md`. For what's broken/missing and the fix
  roadmap, see `docs/audit/`.