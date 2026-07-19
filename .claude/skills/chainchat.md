---
name: chainchat
description: Development assistant for the ChainChat AI workflow collaborator project.
---

# ChainChat Project Skill

Use this skill when working on the ChainChat codebase.

## Project Context

- **Product**: AI Workflow Collaborator — multi-user AI prompt chains, shareable and remixable like Notion docs.
- **Architecture**: Decoupled React/Vite SPA frontend + FastAPI + Uvicorn Python microservices.
- **Services**: `gateway`, `auth-service`, `workflow-service`, `execution-service`, `billing-service`, `notification-service`.
- **Data**: PostgreSQL (RDS) with one schema per service; Redis for cache/queue; S3 for assets.
- **Deployment**: AWS ECS Fargate, Terraform, GitHub Actions.

## Constraints

- Always create a Python virtual environment (`python -m venv .venv`) for any new service.
- Never put secrets in source code; use `.env` files and AWS Secrets Manager in production.
- Keep frontend code TypeScript-only; backend logic belongs in Python services.
- Follow the designs in `docs/HLD.md` and `docs/LLD.md`.
- Maintain one Alembic migration history per service that owns data.

## Common Commands

```bash
# Create all virtual environments
make venv

# Install dependencies in all services + frontend
make install

# Start local development stack (Postgres, Redis, services, frontend)
make dev

# Run all tests
make test

# Run linting and type checks
make lint

# Run all Alembic migrations
make migrate
```

## Adding a New Service

1. Create `services/<name>/`.
2. Add `src/<name>/main.py`, `config.py`, `db.py`, `models.py`, `schemas.py`, `dependencies.py`, and `routers/`.
3. Add `.venv/`, `requirements.txt`, `requirements-dev.txt`, `Dockerfile`, `.env.example`.
4. Add Alembic if the service owns data.
5. Register the service in `docker-compose.yml` and gateway routing.
6. Update `docs/HLD.md` and `docs/LLD.md`.

## File Conventions

- Frontend: `apps/web/src/{components,pages,hooks,stores,lib,types}/`
- Backend routers: `services/<name>/src/<name>/routers/`
- Backend business logic: `services/<name>/src/<name>/services/`
- Backend events: `services/<name>/src/<name>/events/`
- Shared code: `packages/shared/`
