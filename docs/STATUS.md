# ChainChat — Project Status & Roadmap

> Snapshot of what's real, what's in progress, and what comes next.
> For verified, line-by-line findings see the audit docs at the bottom.
>
> **Last updated:** 2026-08-10

## TL;DR — How far along is it?

ChainChat is a **working early-stage product (MVP)**, not a finished commercial release.
The core loop — **build → save → run → watch it execute → review results** — is real and
wired end-to-end. The surrounding "polished paid team product" pieces are in progress.

A React/Vite SPA authenticates with Clerk and calls a single FastAPI **gateway**, which
validates the JWT, injects `x-user-id` / `x-workspace-id` / `x-role` headers, and proxies
each request by path prefix to one of six services:

- **workflow-service** (real CRUD, versions, forks, templates, publish/share) and
  **execution-service** (a real DAG engine that runs prompt-chain steps in dependency
  order, with retries and cancellation, calling live LLMs through OpenRouter) are fully
  implemented **and wired end-to-end from the UI** — you can build, save, run, and remix
  a prompt chain and watch it execute.
- **auth-service** persists users via just-in-time Clerk sync and hosts the **admin
  console** (user directory, time-limited Pro grants); its workspace CRUD and Clerk
  webhook handler are still stubs.
- **billing-service** makes real Stripe calls (checkout + portal) with placeholder
  fallbacks; the subscription state machine is not built yet.
- **notification-service** has real CRUD but no triggers or email channel yet.

See [HOW-IT-WORKS.md](HOW-IT-WORKS.md) for the full walkthrough and
[audit/AUDIT.md](audit/AUDIT.md) for the verified gap list.

## Current Implementation Status

| Capability | Status |
|---|---|
| Gateway routing + JWT validation | ✅ Real (JWKS verification opt-in; dev bypass default) |
| User persistence | ✅ Real (JIT sync on `users/me`; webhook handler is no-op) |
| Workspace/membership persistence | ⚠️ Stubbed (returns demo workspace) |
| Admin console | ✅ Fully implemented (user directory, Pro grants, audit log) |
| Workflow CRUD / versions / fork / templates | ✅ Fully implemented |
| Publish / share + save-as-template | ✅ Implemented (2026-08-10) |
| Execution engine (DAG, retries, cancel) | ✅ Fully implemented |
| AI providers | ✅ All routed through OpenRouter (single provider) |
| Frontend run-a-workflow flow | ✅ Fully wired (build → save → run → poll → results) |
| Live execution updates | ⚠️ SSE polls DB; frontend polls REST instead |
| Billing | ⚠️ Real Stripe checkout/portal calls with placeholders; webhooks no-op; no state machine |
| Plan enforcement / usage metering | ❌ Not implemented (entitlements computed but unused) |
| Cross-service events / notifications | ❌ Not implemented (DB CRUD only, no triggers, no email) |
| Comments | ❌ Model/schemas only — no API, no UI |
| RBAC / Authorization | ❌ Not implemented — `x-role` injected but unread |

## Implementation Phases (from audit)

| Phase | Theme | Status |
|---|---|---|
| P0 | Make CI green (ESLint, Prettier, mypy) | ✅ **Complete** 2026-08-06 |
| P1 | Gateway webhook routing (Clerk + Stripe) | ✅ **Complete** 2026-08-06 |
| P2 | Templates end-to-end (apply + seed data) | ✅ **Complete** 2026-08-06 |
| P3 | Frontend honesty pass (dashboard, billing, members) | ✅ **Complete** 2026-08-06 |
| P4 | Auth completion (workspaces CRUD, Clerk webhook sync) | ⬜ **Next** |
| P5 | Authorization / RBAC | ⬜ |
| P6 | Billing lifecycle + plan gating + usage | ⬜ |
| P7 | Comments, notifications, events | ⬜ |
| P8 | Workflow semantics (publish, decision nodes) | ⬜ |
| P9 | Hardening & coverage (rate limiting, fail-closed JWT, tests) | ⬜ |

See [audit/IMPLEMENTATION-PLAN.md](audit/IMPLEMENTATION-PLAN.md) for per-phase task
details and [audit/PROGRESS.md](audit/PROGRESS.md) for the live status board and
session log.

## Related Documents

| Document | What it is |
|---|---|
| [HOW-IT-WORKS.md](HOW-IT-WORKS.md) | Implementation ground truth — how the product actually behaves as built |
| [audit/AUDIT.md](audit/AUDIT.md) | Verified codebase audit — what works, what's broken, what's missing (stable BUG/GAP/FEAT IDs) |
| [audit/IMPLEMENTATION-PLAN.md](audit/IMPLEMENTATION-PLAN.md) | Phased roadmap for closing every audit finding |
| [audit/PROGRESS.md](audit/PROGRESS.md) | Live status board + session log; read this first when resuming work |