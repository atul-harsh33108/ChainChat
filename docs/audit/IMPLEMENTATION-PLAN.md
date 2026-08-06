# Implementation Plan

Phased plan for closing every finding in [AUDIT.md](AUDIT.md). Track live status in
[PROGRESS.md](PROGRESS.md). Work one phase at a time; within a phase, keep changes
small and mergeable.

**Global definition of done for any fix**
1. Root cause fixed (not just the symptom).
2. Automated test added or updated where the repo has a harness for it.
3. `ruff`/`mypy` (backend) and `eslint`/`tsc` (frontend) pass for touched packages.
4. PROGRESS.md updated in the same commit: status flip + session-log entry with evidence.

## Phase overview

| Phase | Theme | Issues | Effort | Depends on | Status |
|---|---|---|---|---|---|
| P0 | Make CI green | BUG-02, BUG-03, BUG-04 | S | — | ✅ 2026-08-06 |
| P1 | Gateway webhook routing | BUG-01 | S | — | ✅ 2026-08-06 |
| P2 | Templates end-to-end | BUG-05, FEAT-06 | M | — | ✅ 2026-08-06 |
| P3 | Frontend honesty pass | BUG-06 (FE), BUG-07, BUG-08 | M | — | ✅ 2026-08-06 |
| P4 | Auth completion | GAP-03, GAP-04 | L | P1 ✅ | ⬜ next |
| P5 | Authorization (RBAC) | FEAT-01 | L | P4 (soft) | ⬜ |
| P6 | Billing lifecycle + plan gating + usage | GAP-01, GAP-05, GAP-06, BUG-06 (BE) | L | P1, P5 | ⬜ |
| P7 | Comments, notifications, events | GAP-09, GAP-02, FEAT-02, FEAT-05 | L | P5 | ⬜ |
| P8 | Workflow semantics | GAP-07, GAP-08 | L | P2 | ⬜ |
| P9 | Hardening & coverage | FEAT-03, FEAT-04, FEAT-07, FEAT-08 | M–L | all | ⬜ |

P0–P3 are independent and can be done in any order — fix broken things before building
on them.

---

## P0 — Make CI green

**Completed 2026-08-06.** Deviations from the task list: enabling mypy also surfaced and fixed 3 real bugs (gateway `http_client` None guard, `engine.py` response narrowing + `dependents` annotation), and all DB models were migrated to SQLAlchemy 2.0 style (`DeclarativeBase`/`Mapped`/`mapped_column`, `async_sessionmaker`) so mypy checks models natively without a plugin.

**Goal:** every check `ci.yml` runs passes locally and on the next `main` push.

| # | Task | Files |
|---|---|---|
| 1 | Fix `react-hooks/set-state-in-effect`: replace the hydration effect with the "adjust state during render" pattern (track prev `existing` in state, reset during render) or remount the canvas via `key={workflowId}` and initialize state from props | `apps/web/src/pages/workflow-builder.tsx` |
| 2 | Fix `react-hooks/purity`: hoist `Date.now()` out of render (single memoized `now` per render pass) | `apps/web/src/pages/admin.tsx` |
| 3 | Fix `no-useless-assignment`: restructure the token read without the dead initial `null` | `apps/web/src/lib/api.ts` |
| 4 | Replace the two empty props interfaces with type aliases | `apps/web/src/components/ui/input.tsx`, `textarea.tsx` |
| 5 | Resolve `react-refresh/only-export-components` warnings: move non-component exports (cva variants, `ClerkProviderWithRouter`) to their own modules, or add justified per-line disables | `ui/badge.tsx`, `ui/button.tsx`, `main.tsx` |
| 6 | Run `npm run format` (writes Prettier fixes to all 31 files) | `apps/web/src/**` |
| 7 | mypy: add per-service config (`mypy.ini` or `pyproject.toml` with `mypy_path = .` + `explicit_package_bases = true`) and change the `ci.yml` step to run `mypy .` from each service dir (matches the Makefile) | `services/*/mypy.ini`, `.github/workflows/ci.yml` |

**Acceptance:** `npm run lint`, `npm run format:check`, `npx tsc --noEmit`, and
per-service `ruff check src`, `mypy .`, `pytest` all exit 0.
**Tests:** existing suites must stay green (vitest 1/1, pytest health checks).

## P1 — Gateway webhook routing

**Completed 2026-08-06.** As planned; deliverable test suite is `services/gateway/tests/test_proxy.py` (6 tests, mocked upstream).

| # | Task | Files |
|---|---|---|
| 1 | Add `"webhooks": settings.auth_service_url` to `SERVICE_MAP` | `services/gateway/src/gateway/main.py` |
| 2 | Fix the auth skip: bypass when the path's **first segment** is `webhooks` **or any segment** is `webhooks` (covers `billing/webhooks/stripe`) | same |
| 3 | New `test_proxy.py` with a mocked upstream asserting: `webhooks/clerk` without token → proxied; `billing/webhooks/stripe` without token → proxied; `users/me` without token → 401; unknown prefix → 404; upstream down → 503 | `services/gateway/tests/test_proxy.py` |

**Acceptance:** a manual curl matrix matches the test assertions.
**Tests:** the new pytest module is the deliverable.

## P2 — Templates end-to-end

**Completed 2026-08-06.** As planned; also created the workflow-service local venv to run the new apply-endpoint tests.

| # | Task | Files |
|---|---|---|
| 1 | Builder reads `?template=` (`useSearchParams`); when present and the workspace is known, call `POST /templates/{id}/apply` once (ref-guarded), then navigate to the created workflow | `apps/web/src/pages/workflow-builder.tsx`, `apps/web/src/hooks/workflows.ts` (new `useApplyTemplate`) |
| 2 | Seed script: 3 idempotent starter templates (upsert by unique name), e.g. "Blog post pipeline", "Code review chain", "Meeting notes → action items", with real prompt graphs using the free models | `services/workflow-service/scripts/seed_templates.py` |
| 3 | Wire `make seed` + document it; optionally a one-shot compose service | `Makefile`, `docker-compose.yml`, `README.md` |
| 4 | pytest: apply creates workflow + version 1 with the template graph; 404 on unknown template | `services/workflow-service/tests/` |

**Acceptance:** fresh install → gallery shows seeded templates; "Use template" → builder
opens with the template graph as version 1.

## P3 — Frontend honesty pass

**Completed 2026-08-06.** Deviations: pulled in two backend blockers found while wiring — billing `workspace_id` now coerces Clerk org ids (new `ids.py` + schema validators + header coercion), and the stripe 10 exception reference (`stripe.SignatureVerificationError`) was fixed. The portal customer lookup stays in P6 as planned. Billing venv created locally.

| # | Task | Files |
|---|---|---|
| 1 | Dashboard: fetch recent workflows via `useWorkflows(activeId)` (top 5 by `updated_at`); replace the hardcoded "Pro trial" badge with real `useMe().plan` | `apps/web/src/pages/dashboard.tsx` |
| 2 | Billing tab: wire "Upgrade to Pro" → `POST /billing/checkout` → redirect to `url`; "Customer portal" → `POST /billing/portal`; toast when the backend returns placeholder data (dev mode) | `apps/web/src/pages/settings.tsx`, new billing hooks |
| 3 | Members tab: replace `alert()` — embed Clerk org management when an org is active, otherwise an explanatory card (no dead buttons) | `apps/web/src/pages/settings.tsx` |

**Acceptance:** every rendered button does something real; the dashboard shows live data.
**Tests:** manual verification recorded in PROGRESS.md (component tests optional here).
## P4 — Auth completion

| # | Task | Files |
|---|---|---|
| 1 | Real workspaces: `GET /workspaces` (the caller's, via memberships), `POST /workspaces` (creates workspace + owner membership, unique slug, 409 on conflict) | `services/auth-service/src/auth_service/routers/workspaces.py` |
| 2 | Clerk webhook: verify the Svix signature (`CLERK_WEBHOOK_SECRET`), handle `user.created/updated/deleted`, `organization.*`, `organizationMembership.*` → upsert local models; keep JIT sync as a fallback | `routers/webhooks.py`, new sync module |
| 3 | Tests with a dependency-overridden DB session + signature unit tests | `services/auth-service/tests/` |

**Acceptance:** workspaces persist across restarts; a correctly-signed webhook payload
syncs a user; a bad signature → 400.
**Depends on:** P1 (the webhook must be reachable through the gateway).

## P5 — Authorization (RBAC)

| # | Task | Files |
|---|---|---|
| 1 | Shared header dependency per service: parse `x-user-id`/`x-workspace-id`/`x-role` once | workflow-, execution-service |
| 2 | Scope every query/mutation: list/get/update/delete/fork require a workspace match (via `x-workspace-id`); delete additionally requires owner or `org:admin`; writes require editor+; cross-workspace reads → 404 (decide and document 404-vs-403) | routers in both services |
| 3 | Deny-by-default tests with fabricated headers | each service's tests |

**Acceptance:** the access matrix (owner/editor/viewer/outsider × read/write/delete) is
enforced and tested.
**Note:** the header-trust model holds only while the gateway is the sole public entry
point — document that invariant.

## P6 — Billing lifecycle + plan gating + usage

| # | Task | Files |
|---|---|---|
| 1 | Portal: look up `Subscription.stripe_customer_id` by `x-workspace-id` (404 if none) instead of `cus_placeholder` | `services/billing-service/src/billing_service/routers/billing.py` |
| 2 | Webhook state machine: `checkout.session.completed` → upsert Subscription(active, pro); `customer.subscription.updated/deleted` → status transitions; idempotent per event id | same + models |
| 3 | Plan gate on execution create: call auth `GET /users/{clerk_id}/entitlement` (httpx, ~3s timeout); free limits configurable (proposal: 20 runs/day/workspace, max 5 steps/run); `ENTITLEMENTS_REQUIRED=false` escape hatch for dev | `services/execution-service/src/execution_service/routers/executions.py`, new entitlement client |
| 4 | Usage + cost: alembic 0002 in execution-service (add `cost_estimate_usd`, `latency_ms` to executions/steps; populate latency from timestamps, cost/tokens from OpenRouter `usage` when returned); write `usage_records` on completion | execution + billing services |
| 5 | Unit tests: webhook handler with mocked `construct_event`; gate logic with a mocked entitlement client | both services' tests |

**Acceptance:** a Stripe CLI test flow flips a subscription active; an over-limit free
run gets a clear 402/429; usage rows are written per run.

## P7 — Comments, notifications, events

| # | Task | Files |
|---|---|---|
| 1 | Comments API: POST/GET/PATCH/DELETE `/workflows/{id}/comments` (author-only edit/delete), mounted in main | `services/workflow-service/src/workflow_service/routers/comments.py` (new) |
| 2 | Builder comments panel (list + add) | `apps/web/src/pages/workflow-builder.tsx` + hook |
| 3 | Notification trigger v1: execution-service calls notification `/send` over httpx on run completion/failure (direct HTTP first; Redis pub/sub bus deferred — record the decision in PROGRESS.md) | execution-service |
| 4 | Notifications UI: AppLayout bell + unread count (`?is_read=false`), list dropdown/page, mark-read | `apps/web/src/components/layout/AppLayout.tsx` + page |
| 5 | Email channel behind `EMAIL_PROVIDER` (console default; Resend/SMTP optional) | notification-service |
| 6 | pytest for comments + trigger (mocked httpx) | services' tests |

## P8 — Workflow semantics

| # | Task | Files |
|---|---|---|
| 1 | `POST /workflows/{id}/versions/{vid}/publish` + `/unpublish`; UI: publish button + "published" badge | workflow-service + builder |
| 2 | `POST /templates` (create a template from a workflow version; uses the existing `TemplateCreate` schema) | workflow-service |
| 3 | Decision nodes: minimal edge-condition DSL (v1: `{"source_step": "...", "contains": "..."}` / `equals` / `not_empty`); the engine marks non-taken downstream steps `skipped`; alembic migration for condition storage; `graphToSteps` emits the conditions; edge condition editor in the builder | engine + `apps/web/src/lib/graph.ts` + builder |
| 4 | Tests: engine branching unit tests; an end-to-end chain with a decision | execution-service tests |

## P9 — Hardening & coverage

| # | Task | Files |
|---|---|---|
| 1 | Gateway rate limiting: Redis token bucket per user+workspace → 429 + `Retry-After` | `services/gateway` |
| 2 | Fail-closed JWT: startup error when `ENV=prod` and `CLERK_JWKS_URL` is placeholder/empty | gateway config |
| 3 | Engine unit tests: topo sort (incl. cycle + unknown dep), `_render_prompt` matrix, `_retry_delay`, cancellation | `services/execution-service/tests/test_engine.py` |
| 4 | `graphToSteps` vitest suite (transitive deps, duplicate keys, empty prompt, non-prompt-only graph) | `apps/web/src/lib/__tests__/graph.test.ts` |
| 5 | API e2e script: create workflow → run → poll to terminal (documented, runnable against the local stack) | `scripts/` |
| 6 | Optional Sentry init behind `SENTRY_DSN` per service | each service's `main.py` |
| 7 | Optional BUG-09 guard: refuse to boot when `DATABASE_URL` points at a non-chainchat DB unless `ALLOW_FOREIGN_DB=1` | each service's config |

**Acceptance:** execution-engine coverage ≥ 70% (HLD target); CI green including the
new tests.

---

## Working agreements

- One branch per phase (`p0/ci-green`, `p1/webhook-routing`, …), conventional commits.
- Update PROGRESS.md in the same commit as the fix (status + session log).
- If a task uncovers a new issue, add it to AUDIT.md with the next free ID instead of
  fixing it silently.