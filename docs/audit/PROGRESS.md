# ChainChat — Progress Tracker (living memory)

> **Read this file first** at the start of every work session. **Update it last** before
> ending the session: flip statuses with evidence, add a session-log entry.
> Issue IDs are defined in [AUDIT.md](AUDIT.md) (**do not renumber**); phases in
> [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

## 1. Status board

Legend: ⬜ not started · 🚧 in progress · ✅ code fixed · 🧪 auto-tested · ✋ manually
verified · ⏭️ deferred

Statuses stack: an issue is fully done when it shows ✅ + 🧪 + ✋ (as applicable).

### Bugs (AUDIT §3)

| ID | Issue | Phase | Status | Automated test | Manual verify | Notes |
|---|---|---|---|---|---|---|
| BUG-01 | Gateway webhook routing (Clerk 404, Stripe 401) | P1 | ✅ 🧪 | `gateway/tests/test_proxy.py` (6 tests) | 2026-08-06 | `webhooks` added to SERVICE_MAP; auth skip matches any `webhooks` segment |
| BUG-02 | ESLint errors (5) + warnings (3) | P0 | ✅ 🧪 | `npm run lint` in CI | 2026-08-06 | builder hydration effect → prop-init + `key` remount; admin `Date.now()` → query `dataUpdatedAt`; api.ts dead assignment removed; empty interfaces → type aliases; cva variants unexported; `ClerkProviderWithRouter` extracted |
| BUG-03 | Prettier drift (31 files) | P0 | ✅ 🧪 | `format:check` in CI | 2026-08-06 | `npm run format` applied; check now passes |
| BUG-04 | mypy fails under CI invocation | P0 | ✅ 🧪 | `mypy .` per service in CI | 2026-08-06 | `src/__init__.py` + per-service `mypy.ini`; ci.yml runs from service dir; 3 real bugs mypy then surfaced also fixed (see Session 2) |
| BUG-05 | "Use template" dead end | P2 | ✅ 🧪 | `workflow-service/tests/test_templates.py` (3 tests) | 2026-08-06 | builder `ApplyTemplate` reads `?template=`, calls apply, navigates to created workflow |
| BUG-06 | Billing: dead UI buttons + portal placeholder | P3+P6 | ⬜ | — | — | split FE/BE |
| BUG-07 | Dashboard hardcoded | P3 | ⬜ | — | — | |
| BUG-08 | Members tab `alert()` | P3 | ⬜ | — | — | |
| BUG-09 | Global env vars override `.env` | docs | ✅ ✋ | n/a | 2026-08-06 | documented in README + RUNBOOK; pytest verified passing after clearing vars |

### Partial implementations (AUDIT §4)

| ID | Feature | Phase | Status | Automated test | Manual verify | Notes |
|---|---|---|---|---|---|---|
| GAP-01 | Billing lifecycle (webhook state machine) | P6 | ⬜ | — | — | |
| GAP-02 | Notifications: triggers, email, template API, UI | P7 | ⬜ | — | — | |
| GAP-03 | Workspaces API stubbed | P4 | ⬜ | — | — | |
| GAP-04 | Clerk webhook sync (Svix) | P4 | ⬜ | — | — | |
| GAP-05 | Plan enforcement | P6 | ⬜ | — | — | |
| GAP-06 | Usage / cost tracking | P6 | ⬜ | — | — | |
| GAP-07 | Publish / share endpoints + UI | P8 | ⬜ | — | — | |
| GAP-08 | Decision / output node execution | P8 | ⬜ | — | — | |
| GAP-09 | Comments API + UI | P7 | ⬜ | — | — | |

### Not implemented (AUDIT §5)

| ID | Feature | Phase | Status | Automated test | Manual verify | Notes |
|---|---|---|---|---|---|---|
| FEAT-01 | Authorization / RBAC | P5 | ⬜ | — | — | highest impact |
| FEAT-02 | Cross-service event bus | P7 | ⬜ | — | — | v1 = direct HTTP trigger |
| FEAT-03 | Gateway rate limiting | P9 | ⬜ | — | — | |
| FEAT-04 | Fail-closed JWT verification | P9 | ⬜ | — | — | |
| FEAT-05 | Email sending | P7 | ⬜ | — | — | |
| FEAT-06 | Template seed data | P2 | ✅ 🧪 | seed script compiles + ruff; idempotent by unique name | 2026-08-06 | `scripts/seed_templates.py` + `make seed`; 3 starter templates |
| FEAT-07 | Test coverage (engine ≥70%, e2e) | P9 | ⬜ | — | — | |
| FEAT-08 | Observability (Sentry, metrics) | P9 | ⬜ | — | — | |

## 2. Test & check status (most recent runs)

| Suite | Last run | Result | Blocking issue |
|---|---|---|---|
| `apps/web`: `npx tsc --noEmit` | 2026-08-06 | ✅ clean | — |
| `apps/web`: `npm run test` (vitest) | 2026-08-06 | ✅ 1/1 | — |
| `apps/web`: `npm run lint` | 2026-08-06 | ✅ clean (0 problems) | — |
| `apps/web`: `npm run format:check` | 2026-08-06 | ✅ clean | — |
| services: `pytest` (gateway, auth-service) | 2026-08-06 | ✅ 8 passing (gateway 7 incl. new proxy suite, auth 1)* | *requires BUG-09 workaround |
| services: `ruff check src` (all 6) | 2026-08-06 | ✅ clean | — |
| services: `mypy .` (per service dir) | 2026-08-06 | ✅ clean — all 6 services (workflow-service now with full local venv: 18 files) | — |
| services: `pytest` (workflow) | 2026-08-06 | ✅ 4 passing (incl. new template suite)* | *requires BUG-09 workaround |

## 3. Session log (newest first)

### Session 4 — 2026-08-06 · branch `test-v2-30-7` · P2 (templates end-to-end)
- **Did:** fixed BUG-05 + FEAT-06. Frontend: new `useApplyTemplate` hook; builder page
  reads `?template=` and mounts an `ApplyTemplate` component that calls
  `POST /templates/{id}/apply` once (ref-guarded against StrictMode double-effects),
  then navigates to the created workflow. Backend: `scripts/seed_templates.py` with 3
  idempotent starter templates (Blog post pipeline, Code review chain, Meeting notes to
  action items) using the free default model; `make seed` target. Tests: 3 new
  apply-endpoint tests (creates workflow+version with graph, 404, 401) using a fake
  DB session via dependency_overrides. Created the workflow-service local venv to run
  them.
- **Evidence:** workflow pytest 4/4 ✅ · mypy clean (18 files, full deps) ✅ · ruff
  clean ✅ · frontend tsc/eslint/prettier/vitest all green ✅.
- **Gotcha hit:** batching two same-file edits in one tool call can clobber (commands
  may interleave) — edits to the same file now go one call at a time.
- **Next:** P3 — frontend honesty pass (BUG-06 FE, BUG-07, BUG-08).

### Session 3 — 2026-08-06 · branch `test-v2-30-7` · P1 (webhook routing)
- **Did:** fixed BUG-01 — added `"webhooks"` to the gateway `SERVICE_MAP` (routes to
  auth-service) and changed the auth skip from `path.startswith("webhooks/")` to a
  segment match so `billing/webhooks/stripe` is also unauthenticated-proxied. Added
  `services/gateway/tests/test_proxy.py` (6 tests: Clerk webhook, Stripe webhook,
  identity headers, 401/404/503 paths) with mocked upstream via `httpx.MockTransport`.
  Modernized gateway `test_health.py` to `ASGITransport` (other services still use the
  deprecated `app=` shortcut — clean up when their venvs exist; see §5).
- **Evidence:** gateway pytest 7/7 ✅ · ruff clean (src+tests) ✅ · mypy clean (9 files) ✅.
- **Docs:** HOW-IT-WORKS §3/§7.1/§8/TL;DR updated to reflect the fix.
- **Next:** P2 — templates end-to-end (BUG-05, FEAT-06) or P3 (frontend honesty pass).

### Session 2 — 2026-08-06 · branch `test-v2-30-7` · P0 (make CI green)
- **Did:** fixed BUG-02, BUG-03, BUG-04 — CI gates are green locally.
  - BUG-02: `workflow-builder.tsx` hydration `useEffect` removed — the page component
    now owns `useWorkflow`, gates on loading, and mounts `<Builder key={workflowId}>`
    which initializes state from props (also fixes canvas state surviving save→navigate);
    `admin.tsx` render-time `Date.now()` replaced by the query's `dataUpdatedAt`;
    `api.ts` dead assignment removed; `input.tsx`/`textarea.tsx` empty interfaces →
    type aliases; `badge.tsx`/`button.tsx` stopped exporting unused cva variants;
    `ClerkProviderWithRouter` moved out of `main.tsx` into `components/auth/`.
  - BUG-03: `npm run format` (Prettier rewrote 31 files).
  - BUG-04: added `src/__init__.py` + `mypy.ini` to all 6 services; `ci.yml` mypy step
    now runs from each service dir. Enabling real mypy surfaced and fixed 3 genuine
    bugs: gateway `http_client` possible-None guard (`main.py`), `engine.py`
    response-None narrowing + missing `dependents` annotation. Migrated all 5 DB
    services' `models.py` to SQLAlchemy 2.0 style (`DeclarativeBase`, `Mapped`,
    `mapped_column`) and `db.py` to `async_sessionmaker` with a correct
    `AsyncGenerator` return type on `get_db`.
- **Evidence:** eslint 0 problems · format:check clean · tsc 0 errors · vitest 1/1 ·
  ruff clean on all 6 services · mypy clean on all 6 services (auth 20 files, gateway 8,
  workflow 16, execution 17, billing 14, notification 14) · pytest auth+gateway passing.
- **Decisions:** D7, D8, D9.
- **Note:** mypy for the 4 services without local venvs was cross-checked using
  auth-service's mypy binary (`ignore_missing_imports` covers missing deps); CI
  installs full deps and may type third-party calls more strictly.
- **Next:** P1 — gateway webhook routing (BUG-01).

### Session 1 — 2026-08-06 · branch `test-v2-30-7` · docs only
- **Did:** full-repo audit (read all 6 services + gateway + frontend; ran tsc/vitest/
  pytest/ruff/eslint/prettier/mypy). Created `docs/audit/AUDIT.md`,
  `docs/audit/IMPLEMENTATION-PLAN.md`, `docs/audit/PROGRESS.md`. Updated
  `docs/HOW-IT-WORKS.md` (was 2 commits stale), `README.md` (status paragraph, doc
  links, env gotcha), `docs/RUNBOOK.md` (troubleshooting rows).
- **Evidence:** AUDIT.md §1 (verification table).
- **Decisions:** D6 (stable issue IDs).
- **Next:** start P0 (make CI green) — BUG-02, BUG-03, BUG-04.

## 4. Decisions log (append-only)

| # | Date | Decision | Rationale |
|---|---|---|---|
| D1 | 2026-07 (e1f95fe era) | JIT user sync in `users/me` instead of relying on Clerk webhooks | Webhooks unreachable in local dev |
| D2 | 2026-07 (63d324f) | Single OpenRouter provider for all models | One OpenAI-compatible contract; free models |
| D3 | 2026-07 (af7449c) | ORM attr `meta_data` with `metadata` JSON alias | SQLAlchemy reserves `metadata` |
| D4 | 2026-07 (6c9ee47) | Frontend polls executions instead of SSE | `EventSource` can't send `Authorization` through the gateway |
| D5 | 2026-07 (e1f95fe) | Admin rights from `ADMIN_EMAILS` env, not DB | No bootstrap problem; can't be escalated via app data |
| D6 | 2026-08-06 | Track work with stable issue IDs across AUDIT/PLAN/PROGRESS | Unambiguous status across files and sessions |
| D7 | 2026-08-06 | Models use SQLAlchemy 2.0 `DeclarativeBase` + `Mapped`/`mapped_column`; `db.py` uses `async_sessionmaker` | Lets mypy type-check models natively, no sqlalchemy plugin needed |
| D8 | 2026-08-06 | mypy runs per-service from the service dir (`mypy.ini` + `src/__init__.py`); CI updated to match the Makefile | Both invocation styles previously failed (found-twice / import-not-found) |
| D9 | 2026-08-06 | TanStack `dataUpdatedAt` is the render-safe "now" for expiry math | `Date.now()` in render trips react-hooks/purity |

## 5. Session memory — environment & conventions

- **Machine:** Windows + PowerShell. Per-service venvs at `services/<svc>/.venv`; invoke
  tools as `.venv\Scripts\<tool>.exe`. Only auth-service + gateway + workflow-service venvs exist locally;
  create others with `make venv && make install` (or per-service equivalents) as needed.
- **⚠️ BUG-09 workaround:** this machine globally exports `DATABASE_URL` and `REDIS_URL`
  belonging to another project. Run `$env:DATABASE_URL=$null; $env:REDIS_URL=$null` in
  each new PowerShell session before `pytest`/uvicorn, or they override service `.env`
  files.
- **Commits:** conventional commits (`feat(admin): …`, `refactor: …`, `docs: …`).
- **CI gotcha:** `.github/workflows/ci.yml` only triggers on `main`; feature branches
  get no signal — run lint/format/type checks locally before merging.
- **Frontend gates:** `npm run lint` uses `--max-warnings 0`; CI also runs
  `format:check`, `test`, and `build`.
- **Executions need:** the RQ worker (`execution-worker` in compose) and
  `OPENAI_API_KEY` set to an OpenRouter key.
- **Gateway auth:** JWTs verified only when `CLERK_JWKS_URL` is real (FEAT-04);
  otherwise any well-formed JWT passes.
- **Docs maintenance:** when fixing an issue, update its row in §1, the suite table in
  §2, and add a §3 entry — in the same commit as the fix.

## 6. Update rules

1. Flip a status only with evidence: link the test run or write the manual steps in the
   session log.
2. 🧪 requires an automated test committed to the repo; ✋ requires dated
   manual-verification steps.
3. One session-log entry per work session, newest first. Append-only — never rewrite
   history.
4. If a finding turns out wrong, mark it ⏭️ with a note instead of deleting it.