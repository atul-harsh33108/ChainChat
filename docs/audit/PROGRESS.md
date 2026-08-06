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
| BUG-01 | Gateway webhook routing (Clerk 404, Stripe 401) | P1 | ⬜ | — | — | |
| BUG-02 | ESLint errors (5) + warnings (3) | P0 | ⬜ | — | — | exact list in AUDIT §3 |
| BUG-03 | Prettier drift (31 files) | P0 | ⬜ | — | — | |
| BUG-04 | mypy fails under CI invocation | P0 | ⬜ | — | — | |
| BUG-05 | "Use template" dead end | P2 | ⬜ | — | — | |
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
| FEAT-06 | Template seed data | P2 | ⬜ | — | — | |
| FEAT-07 | Test coverage (engine ≥70%, e2e) | P9 | ⬜ | — | — | |
| FEAT-08 | Observability (Sentry, metrics) | P9 | ⬜ | — | — | |

## 2. Test & check status (most recent runs)

| Suite | Last run | Result | Blocking issue |
|---|---|---|---|
| `apps/web`: `npx tsc --noEmit` | 2026-08-06 | ✅ clean | — |
| `apps/web`: `npm run test` (vitest) | 2026-08-06 | ✅ 1/1 | — |
| `apps/web`: `npm run lint` | 2026-08-06 | ❌ 5 errors, 3 warnings | BUG-02 |
| `apps/web`: `npm run format:check` | 2026-08-06 | ❌ 31 files | BUG-03 |
| services: `pytest` (gateway, auth-service) | 2026-08-06 | ✅ passing* | *requires BUG-09 workaround |
| services: `ruff check src` (gateway, auth-service) | 2026-08-06 | ✅ clean | — |
| services: `mypy` (CI invocation) | 2026-08-06 | ❌ import errors | BUG-04 |
| services: `pytest` (workflow/execution/billing/notification) | never | — | no local venvs yet; `make venv && make install` first |
## 3. Session log (newest first)

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

## 5. Session memory — environment & conventions

- **Machine:** Windows + PowerShell. Per-service venvs at `services/<svc>/.venv`; invoke
  tools as `.venv\Scripts\<tool>.exe`. Only auth-service + gateway venvs exist locally;
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