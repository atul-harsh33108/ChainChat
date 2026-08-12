# Concurrency & Security Audit (2026-08-12)

**Date:** 2026-08-12  
**Branch:** `test-v7-10-08_fted`  
**Scope:** Runtime architecture (docker-compose), gateway auth flow, service authorization, execution pipeline, database/Redis topology  
**Auditor:** AI-assisted review of live code + config

---

## 1. Concurrency Analysis

### Current Deployment Topology (docker-compose.yml)

| Service | Instances | Workers | Concurrency Model | Bottleneck |
|---------|-----------|---------|-------------------|------------|
| **gateway** | 1 | 1 (uvicorn `--reload`) | async single-thread | ~200–400 req/s |
| **auth-service** | 1 | 1 (`--reload`) | async single-thread | ~150–300 req/s |
| **workflow-service** | 1 | 1 (`--reload`) | async single-thread | ~150–300 req/s |
| **execution-service** | 1 | 1 (`--reload`) | async single-thread | ~150–300 req/s |
| **billing-service** | 1 | 1 (`--reload`) | async single-thread | ~150–300 req/s |
| **notification-service** | 1 | 1 (`--reload`) | async single-thread | ~150–300 req/s |
| **execution-worker** | 1 | 1 (RQ default) | **synchronous, 1 job at a time** | **1–2 concurrent runs** |
| **postgres** | 1 | — | default config (max_connections=100) | ~100–200 connections |
| **redis** | 1 | — | single instance | queue depth, pub/sub limits |
| **web (vite)** | 1 | — | dev server only | static files — negligible |

### Realistic Capacity Estimates

| Workload | Concurrent Users | Notes |
|----------|------------------|-------|
| **Editing only** (no runs) | 50–100 | Read-heavy API, stateless frontend |
| **Mixed edit + run** | 10–20 | Execution queue saturates quickly |
| **Burst runs** (5+ simultaneous) | Queue backs up; users see "pending" for minutes | Single RQ worker = serial execution |

### Key Concurrency Bottlenecks

1. **Single RQ worker** (`docker-compose.yml:106`) — `rq worker execution` runs one job at a time. A 10-step workflow with 5 LLM calls takes 30–90s. Throughput: **~40–120 runs/hour total**.

2. **`--reload` flag on all services** — Development mode adds ~2–3× latency per request and prevents worker multiprocessing.

3. **No connection pooling** — Each FastAPI service creates its own `asyncpg` pool (default size 5). 6 services × 5 = 30 connections, but no PgBouncer means connection churn under load.

4. **No horizontal scaling** — Docker Compose has no replica support; Kubernetes HPA needed for production.

5. **Redis single instance** — Queue + cache + pub/sub on one node; no Sentinel/Cluster for HA.

### Concurrency Fix Priority

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| **P0** | `rq worker -c 4` (or `-c 8`) on execution-worker | 1 line | 4–8× execution throughput |
| **P0** | Remove `--reload` from all uvicorn commands | 1 line each | 2–3× request throughput |
| **P0** | `uvicorn --workers 4` (or CPU count) per service | 1 line each | Utilize all cores |
| **P1** | Add PgBouncer (transaction pooling) | ~30 min | 100+ app connections → 20 DB connections |
| **P1** | Redis Sentinel/Cluster for HA | ~1 hr | Queue durability, failover |
| **P2** | K8s HPA on RQ queue depth + CPU | ~2 hr | Auto-scale workers 1→20+ |
| **P2** | Gateway rate limiting (per user/workspace) | ~2 hr | Protect LLM quotas, prevent DoS |

---

## 2. Security Analysis

### What's Working Well ✅

| Control | Implementation |
|---------|----------------|
| **Authentication** | Clerk JWT validation at gateway (`jose` RS256 + JWKS), `audience="chainchat"` |
| **Admin Authorization** | `ADMIN_EMAILS` allow-list checked against Clerk email at request time (not stored in DB) |
| **Secret Management** | All secrets via env vars; `.example` files have placeholders; Terraform uses variables |
| **SQL Injection Prevention** | SQLAlchemy ORM + parameterized queries everywhere |
| **CORS** | Restricted to `localhost:5173` + `chainchat.io` |
| **Input Validation** | Pydantic schemas on all API boundaries |
| **Rate Limit Handling** | OpenRouter 429 → exponential backoff with `Retry-After` respect |
| **Audit Logging** | Admin Pro grants create `AuditLog` entries |

### Critical Gaps (Fix Before Production) 🔴

| # | Issue | File/Location | Risk |
|---|-------|---------------|------|
| **1** | **Clerk webhook signature NOT verified** | `auth-service/src/auth_service/routers/webhooks.py:7` | Anyone can POST fake `user.created` events → create users, escalate privileges |
| **2** | **No workspace membership check** | `workflow-service/src/workflow_service/routers/workflows.py` (all endpoints) | User A can read/write User B's workflows by guessing UUID |
| **3** | **Execution service has NO auth** | `execution-service/src/execution_service/routers/executions.py` | Any caller with gateway access can create/list/cancel executions for any workspace |
| **4** | **Gateway dev bypass** | `gateway/src/gateway/main.py:65-70` | If `CLERK_JWKS_URL` missing/placeholder → accepts **unverified** JWT claims |
| **5** | **No request size limits** | Gateway `httpx.AsyncClient` default | DoS via large payloads |
| **6** | **Single RQ worker = no execution isolation** | `docker-compose.yml:106` | Malicious/broken workflow blocks all others |

### Medium Gaps 🟠

| Issue | Location | Notes |
|-------|----------|-------|
| **No row-level security (RLS)** | PostgreSQL schemas (`auth`, `workflow`, `execution`, `billing`, `notification`) | Relies on app-layer checks only |
| **No API rate limiting** | Gateway | Authenticated users can hammer endpoints |
| **Secrets in docker-compose** | `docker-compose.yml` lines 38-39, 76-77, 97-98, 114 | Dev-only; production must use secrets manager |
| **Clerk `org_role` trusted blindly** | Gateway `x-role` header | Can be spoofed if JWKS bypass active |
| **No CSP / security headers** | Gateway/Frontend | Missing `Content-Security-Policy`, `X-Frame-Options`, etc. |
| **Execution SSE stream unauthenticated** | `executions.py:138-145` | Only checks execution exists, not workspace access |

### Security Fix Priority

```python
# 1. CRITICAL - Clerk webhook verification (auth-service/routers/webhooks.py)
import os
from svix import Webhook

WH_SECRET = os.environ["CLERK_WEBHOOK_SECRET"]
wh = Webhook(WH_SECRET)

@router.post("/clerk")
async def clerk_webhook(request: Request):
    payload = await request.body()
    headers = dict(request.headers)
    try:
        wh.verify(payload, headers)
    except Exception:
        raise HTTPException(401, "Invalid webhook signature")
    # ... handle event

# 2. CRITICAL - Workspace membership guard (workflow-service)
def _require_workspace_access(request: Request, workspace_id: UUID, db: AsyncSession):
    user_id = _current_user_id(request)
    # Check user belongs to workspace via Clerk org membership
    # or local membership table

# 3. CRITICAL - Execution service auth (add x-user-id, x-workspace-id checks)

# 4. CRITICAL - Remove dev bypass in gateway (fail closed if JWKS missing)

# 5. HIGH - Add rate limiting (slowapi or nginx)

# 6. HIGH - Security headers middleware

# 7. MEDIUM - PostgreSQL RLS policies per schema
```

---

## 3. Combined Risk Matrix

| Area | Current State | Production Ready? | Blocker |
|------|---------------|-------------------|---------|
| **Authentication** | ✅ Clerk JWT at gateway | Yes (with JWKS fix) | FEAT-04 |
| **Authorization (admin)** | ✅ Email allow-list | Yes | — |
| **Authorization (workspace)** | ❌ Missing everywhere | **No** | FEAT-01 |
| **Execution Isolation** | ❌ Single worker, no auth | **No** | Critical gaps 2,3,6 |
| **Webhook Security** | ❌ No signature verification | **No** | Critical gap 1 |
| **Rate Limiting** | ❌ None | **No** | FEAT-03 |
| **Secrets Management** | ⚠️ Env vars in compose | Dev only | Use secrets manager |
| **TLS/Headers** | ❌ Missing CSP, HSTS | **No** | Add middleware |
| **Concurrency (editing)** | ~50–100 users | Marginal | Remove `--reload`, add workers |
| **Concurrency (runs)** | ~1–4 simultaneous | **No** | Scale RQ workers |

---

## 4. Recommended 2-Week Remediation Plan

### Week 1: Security Hardening
- [ ] Clerk webhook Svix verification
- [ ] Workspace membership checks on all workflow/execution endpoints
- [ ] Execution service auth (validate `x-user-id`, `x-workspace-id`)
- [ ] Remove gateway dev bypass (fail closed if JWKS missing)
- [ ] Basic rate limiting (slowapi on gateway)
- [ ] Security headers middleware

### Week 2: Concurrency & Production Readiness
- [ ] `rq worker -c 4` (configurable via env)
- [ ] Remove `--reload` from all services
- [ ] `uvicorn --workers 4` per service
- [ ] Add PgBouncer (transaction pooling)
- [ ] Redis Sentinel/Cluster setup
- [ ] K8s HPA manifests (queue depth + CPU)
- [ ] Move secrets to Vault/SealedSecrets/Cloud provider secret manager

---

## 5. Verdict

| Dimension | Status | Go/No-Go for Production |
|-----------|--------|-------------------------|
| **Security** | ❌ Critical gaps | **NO-GO** — fix 4 critical items first |
| **Concurrency** | ⚠️ Dev-only capacity | **NO-GO** — single worker + `--reload` |
| **Features** | ✅ Core workflows work | Ready (but unusable without above) |

> **Bottom line:** Secure the doors before you invite guests; add chairs before you host a party.

---

## 6. References

- [AUDIT.md](AUDIT.md) — Original codebase audit (2026-08-06)
- [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) — Phased fix plan
- [PROGRESS.md](PROGRESS.md) — Live tracker
- [ARCHITECTURE.md](../ARCHITECTURE.md) — System design
- [RUNBOOK.md](../RUNBOOK.md) — Operational procedures