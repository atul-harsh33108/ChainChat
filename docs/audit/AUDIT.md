# ChainChat Codebase Audit

- **Date:** 2026-08-06
- **Branch:** `test-v2-30-7` (audited at `e1f95fe`; fixes land on top)
- **Scope:** entire repo — gateway + 5 FastAPI services, React/Vite frontend, docker-compose, CI/CD, docs
- **Companion docs:** [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) (phased fix plan) · [PROGRESS.md](PROGRESS.md) (live tracker, updated every work session)
- **Status snapshot (2026-08-06):** P0–P3 complete — all 9 BUGs addressed (BUG-06's
  portal-customer backend piece remains, scheduled in P6). GAP/FEAT items open.
  Live status: PROGRESS.md.

Every finding has a stable ID — `BUG-xx` = implemented but broken, `GAP-xx` = partially
implemented, `FEAT-xx` = designed but absent. The same IDs are used across the plan and
tracker. **Do not renumber.**

---

## 1. Verification — what was actually executed

This audit ran the code, not just read it:

| Check | Command / scope | Result |
|---|---|---|
| TypeScript compile | `npx tsc --noEmit` in `apps/web` | ✅ 0 errors |
| Frontend unit tests | `npm run test` (vitest) | ✅ 1/1 passing |
| Backend tests | `pytest` (gateway, auth-service — the two services with local venvs) | ✅ passing (only after working around BUG-09) |
| Python lint | `ruff check src` (auth-service, gateway) | ✅ passing |
| Frontend lint | `npm run lint` | ❌ 5 errors, 3 warnings — BUG-02 |
| Frontend formatting | `npm run format:check` | ❌ 31 files unformatted — BUG-03 |
| Backend type check | `mypy` the way `ci.yml` invokes it | ❌ fails for every service — BUG-04 |

> **Docs drift:** `docs/HOW-IT-WORKS.md` predates commits `6c9ee47` (error boundary +
> routing/graph refactor) and `e1f95fe` (admin console). Its "known gaps" 1–3
> (run-workflow contract, ignored list filter, camelCase/snake_case mismatch) and the
> `users/me` demo-data gap were **already fixed** when this audit ran. HOW-IT-WORKS.md
> has been updated as part of this audit.>
> **Re-run after P0–P3 (2026-08-06):** eslint 0 problems · prettier clean · tsc 0
> errors · vitest 1/1 · ruff clean (all 6 services) · mypy clean (all 6 services) ·
> pytest 18 passing across gateway (7), auth (1), workflow (4), billing (6).
> **All CI gates green.**

## 2. Implemented and working correctly

| Area | Why it's believed working |
|---|---|
| Gateway routing + identity headers | `services/gateway/src/gateway/main.py` — prefix routing, `x-user-id`/`x-workspace-id`/`x-role` injection, 503 on upstream failure, 404 on unknown prefix. Webhook paths excepted — BUG-01 |
| Workflow CRUD, versions, fork, templates API | `services/workflow-service/src/workflow_service/routers/` — real async CRUD; fork deep-copies versions/nodes/edges with ID remapping; version numbers via `max()+1`; template apply creates workflow + initial version |
| Execution DAG engine | `services/execution-service/src/execution_service/engine.py` — Kahn's topological sort with cycle/unknown-dependency detection; per-step retries with 429-aware backoff honouring `Retry-After`; cooperative cancellation; friendly provider error messages |
| OpenRouter AI provider | `ai.py` — single OpenAI-compatible provider, per-step `model_key`, free-model defaults; all provider keys route through OpenRouter |
| Execution API | `routers/executions.py` — create/list (`chain_id`, `workspace_id`, `limit`, `offset`)/get/cancel (409 once terminal) + DB-polling SSE stream |
| RQ worker | `docker-compose.yml` `execution-worker` (`rq worker execution`) — without it runs stay `pending` |
| Frontend builder | `apps/web/src/pages/workflow-builder.tsx` — Save creates immutable versions; Run = save → `graphToSteps()` (validation + transitive dependency resolution) → `POST /executions` → live polling with per-step output and terminal-state toasts; Remix wired |
| Runs history | `apps/web/src/pages/workflow-runs.tsx` — real per-workflow executions with step outputs, retries, status badges |
| Admin console | `services/auth-service/src/auth_service/routers/admin.py` + `apps/web/src/pages/admin.tsx` — Clerk user directory search, time-boxed Pro grants with stacking (never shortens), revoke, grant history, audit log; admin rights from `ADMIN_EMAILS` env, not the DB |
| `users/me` JIT sync | `services/auth-service/src/auth_service/entitlements.py` — local user mirror upserted from the Clerk Backend API per request; placeholder email fallback when Clerk unconfigured |
| External ID coercion | `ids.py` `to_uuid()` — Clerk string IDs → deterministic UUIDv5, applied consistently in all three data services |
| Frontend auth plumbing | `TokenSync` + `lib/api.ts` — per-request fresh token via registered provider, localStorage fallback, no redirect races on 401 |
| Frontend routing hygiene | `App.tsx` — Clerk path-routing splats, protected `/app/*`, catch-all redirect; `ErrorBoundary` in `main.tsx` |

## 3. Broken — implemented but not working (BUG-xx)

### BUG-01 — Webhooks are unreachable through the gateway 🔴
- `POST /api/v1/webhooks/clerk` → **404**: `SERVICE_MAP` in `services/gateway/src/gateway/main.py` has no `"webhooks"` key; routing fails before the auth-skip check runs.
- `POST /api/v1/billing/webhooks/stripe` → **401**: the auth skip is `path.startswith("webhooks/")`, which never matches `billing/webhooks/…`.
- Harmless today only because both handlers are no-ops. Blocks GAP-01 and GAP-04.
- **Status: ✅ FIXED 2026-08-06 (P1)** — `webhooks` added to `SERVICE_MAP`; auth skip matches any `webhooks` segment; covered by `gateway/tests/test_proxy.py` (6 tests).

### BUG-02 — Frontend ESLint fails (CI red) 🔴
`npm run lint` runs with `--max-warnings 0`; current output = 5 errors, 3 warnings:

| Location | Severity | Rule |
|---|---|---|
| `src/pages/workflow-builder.tsx:86` | error | `react-hooks/set-state-in-effect` (canvas hydration effect) |
| `src/pages/admin.tsx:270` | error | `react-hooks/purity` (`Date.now()` during render) |
| `src/lib/api.ts:30` | error | `no-useless-assignment` |
| `src/components/ui/input.tsx:4` | error | `@typescript-eslint/no-empty-object-type` |
| `src/components/ui/textarea.tsx:4` | error | `@typescript-eslint/no-empty-object-type` |
| `src/components/ui/badge.tsx:29`, `src/components/ui/button.tsx:48`, `src/main.tsx:22` | warning | `react-refresh/only-export-components` |

- **Status: ✅ FIXED 2026-08-06 (P0)** — eslint now reports 0 problems.

### BUG-03 — Prettier check fails (CI red) 🔴
`npm run format:check` → "Code style issues found in 31 files." `ci.yml` runs this step,
so the frontend CI job fails.
- **Status: ✅ FIXED 2026-08-06 (P0)** — `format:check` passes.

### BUG-04 — Backend mypy fails the way CI runs it (CI red) 🔴
`ci.yml` runs `mypy services/<svc>/src` from the repo root → 28 `import-not-found`
errors: the code imports `from src.<pkg>…` but there is no `src/__init__.py` and no
mypy path config. Running `mypy .` from a service directory (Makefile style) fails
differently: "Source file found twice under different module names". Never surfaced
because CI only triggers on `main`, and this work happened on `test-v2-30-7`.
- **Status: ✅ FIXED 2026-08-06 (P0)** — `src/__init__.py` + per-service `mypy.ini`; CI runs from the service dir. Enabling mypy then surfaced (and fixed) 3 real bugs: gateway None guard, engine.py narrowing + annotation; models migrated to SQLAlchemy 2.0 style.

### BUG-05 — "Use template" flow is a dead end 🟠
`apps/web/src/pages/templates.tsx:28` navigates to `/app/w/<org>/workflows/new?template=<id>`,
but **nothing reads that param** (no `useSearchParams` anywhere in `apps/web/src`). The
working backend endpoint `POST /api/v1/templates/{id}/apply`
(`services/workflow-service/src/workflow_service/routers/templates.py:56`) is never
called. Compounded by FEAT-06 (no seed data → gallery empty).
- **Status: ✅ FIXED 2026-08-06 (P2)** — the builder consumes `?template=` and calls the apply endpoint; seed data via `make seed`.

### BUG-06 — Billing dead ends 🟠
- `apps/web/src/pages/settings.tsx:82-83` — "Upgrade to Pro" and "Customer portal" buttons have **no click handlers**.
- `services/billing-service/src/billing_service/routers/billing.py:86` — portal hardcodes `customer="cus_placeholder"` → would 502 against real Stripe.
- **Status: ✅ frontend FIXED 2026-08-06 (P3)** — buttons wired; the billing API coerces Clerk workspace ids; the `stripe.error` crash is fixed. The portal customer lookup remains open (P6).

### BUG-07 — Dashboard is hardcoded 🟠
`apps/web/src/pages/dashboard.tsx` — "Pro trial" badge (line 29) ignores the real plan
from `useMe()`; "Recent workflows" (lines 85-92) is a static empty state that never
fetches.
- **Status: ✅ FIXED 2026-08-06 (P3)** — real recent workflows + real plan badge.

### BUG-08 — Members tab invite is an `alert()` 🟠
`apps/web/src/pages/settings.tsx:61` — `onClick={() => alert('Open Clerk dashboard to invite members')}`.
- **Status: ✅ FIXED 2026-08-06 (P3)** — real members list + Clerk invites.

### BUG-09 — Machine-global env vars override service `.env` files 🟡
The dev machine exports `DATABASE_URL=postgresql+psycopg://mlops:…@postgres:5432/mlops`
and `REDIS_URL=redis://redis:6379/0` from another project. pydantic-settings prefers
process env over `.env`, so local `pytest`/uvicorn silently use the foreign database
(and the `psycopg` driver, which isn't installed → test collection errors). Verified:
clearing the vars makes the suite pass. Mitigation documented in README + RUNBOOK;
optional repo-level guard in P9.
- **Status: ✅ FIXED (docs) 2026-08-06** — README + RUNBOOK mitigations documented; optional boot guard in P9.

### BUG-10 — Frontend ESLint fails again: `react-hooks/refs` in `run-input-editor.tsx` 🟠
`apps/web/src/components/workflow/run-input-editor.tsx:111` — `useState(() => runInputs.map(...))`'s
lazy initializer calls `makeId()`, which reads a `useRef` (`idCounterRef.current`)
during the initializer call. The `react-hooks/refs` rule flags any ref read reachable
from a render-time function as unsafe (refs are meant for effects/handlers, not
render). Introduced by the `run-inputs-and-variables` feature work, predates this
session — found while re-running `npm run lint` to verify GAP-07 changes didn't
regress it; it was already failing beforehand. Also observed: `npm run format:check`
fails across ~70 unrelated files on this machine, but this is a `core.autocrlf=true`
checkout artifact, not a repo defect — confirmed via `git show HEAD:<file> | prettier
--check` passing and `git diff -b` showing zero content difference for the flagged
files.
- **Status: ⬜ open** — not fixed in this session. Scoped fix: compute each row's id
  without reading the ref inside `useState`'s lazy initializer (e.g. derive from the
  `runInputs` array index, or move id assignment into a `useEffect`/plain counter that
  doesn't run during render).

## 4. Partially implemented (GAP-xx)

| ID | Feature | Current state |
|---|---|---|
| GAP-01 | Billing lifecycle | Checkout real only when keys configured; webhook verifies signature (when secret set) but **acts on no event**; subscriptions are read, never created/updated by the system — no state machine |
| GAP-02 | Notifications | DB CRUD only; **no triggers, no email channel** (no SMTP/SES/SendGrid anywhere), `NotificationTemplate` model has no API, **no frontend UI** |
| GAP-03 | Workspaces API | `GET /workspaces` → `[]`, `POST` → hardcoded demo; `Workspace`/`Membership` models exist but unused |
| GAP-04 | Clerk webhook sync | No-op `{"received": true}`; no Svix signature verification; deliberately superseded by JIT sync (which works) — still needed for org/membership sync and deletions |
| GAP-05 | Plan enforcement | Entitlements computed and displayed (Pro badge) but **gate nothing**; `GET /users/{clerk_id}/entitlement` built for other services and has zero callers |
| GAP-06 | Usage / cost tracking | `usage_records` table + read endpoint exist; **nothing writes**; no `cost_estimate_usd`/`latency_ms` columns (LLD specifies both); the landing page already advertises "cost estimates" |
| GAP-07 | Publish / share | **Status: ✅ FIXED 2026-08-10** — `POST /workflows/{id}/versions/{vid}/publish` + `/unpublish` set/clear `published_version_id` (404 on unknown workflow/version, 409 on unpublishing a non-published version); `POST /templates` creates a template from the caller-supplied graph, optionally linked via `source_workflow_id` for provenance (not gated on the workflow being published — see D10), 409 on a duplicate name; builder UI: Publish/Unpublish toggle + "Published" badge, "Save as template" dialog |
| GAP-08 | Decision / output nodes | Cosmetic — `graphToSteps` executes only `prompt` nodes; `WorkflowEdge.condition` is stored but **never evaluated**; no branching in the engine |
| GAP-09 | Comments | `Comment` model + `CommentCreate`/`CommentRead` schemas + migration exist; **no router mounted, no UI** |

## 5. Designed but not implemented (FEAT-xx)

| ID | Feature | Notes |
|---|---|---|
| FEAT-01 | Authorization / RBAC | `x-role` injected by the gateway, **read by no service**; no ownership/workspace checks on any workflow or execution read/write/delete — any authenticated user can mutate anything. Highest-impact gap |
| FEAT-02 | Cross-service event bus | No Redis pub/sub publishers or subscribers; Redis is only the RQ queue |
| FEAT-03 | Gateway rate limiting | LLD requires per user + workspace; no code exists |
| FEAT-04 | Production JWT verification | Opt-in: default `clerk_jwks_url=""` → **unverified** JWT decode; needs fail-closed config before any real deployment |
| FEAT-05 | Email sending | No provider integration (invites, notifications) |
| FEAT-06 | Template seed data | Gallery is empty on a fresh install |
| FEAT-07 | Test coverage | Backend: health-check tests only; frontend: 1 test; Playwright configured with 0 specs; HLD targets >70% on the execution engine |
| FEAT-08 | Observability | structlog logs only; no Sentry init, no metrics (LLD lists `execution_duration_ms`, `ai_request_latency`, `workflow_forks`) |

## 6. Security-relevant summary

1. **FEAT-01** — no authorization enforcement anywhere downstream.
2. **FEAT-04** — unverified JWT decode is the default; fine for dev, dangerous deployed.
3. **BUG-01** — routing fixed in P1. Signature verification must still land with
   GAP-01/GAP-04, or webhooks remain unauthenticated (currently no-op) write paths.
4. Admin authorization (`ADMIN_EMAILS` in config, not DB) — sound; verified in `admin.py`.
5. Services trust gateway-injected headers blindly — safe only while the gateway is the
   single public entry point; keep it that way.