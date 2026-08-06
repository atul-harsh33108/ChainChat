# ChainChat Production Runbook

## Local Development

```bash
make venv
make install
make dev
```

Open http://localhost:5173 for the frontend. The gateway is at http://localhost:8000.
The compose stack includes the `execution-worker` (RQ worker) — without it, executions
stay `pending` forever.

## Deploy to AWS

### Prerequisites

- AWS CLI configured
- Terraform >= 1.9
- Docker
- GitHub secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

### Bootstrap Terraform State

Create an S3 bucket for Terraform state (one-time):

```bash
aws s3 mb s3://chainchat-terraform-state --region us-east-1
```

### Provision Infrastructure

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with real secrets
terraform init
terraform plan
terraform apply
```

### Deploy Services

Push images to ECR and update ECS services:

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
for svc in gateway auth-service workflow-service execution-service billing-service notification-service; do
  docker build -t chainchat/$svc:latest ./services/$svc
  docker tag chainchat/$svc:latest $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/chainchat/$svc:latest
  docker push $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/chainchat/$svc:latest
done
for svc in gateway auth-service workflow-service execution-service billing-service notification-service; do
  aws ecs update-service --cluster chainchat --service $svc --force-new-deployment
done
```

CI/CD is automated via `.github/workflows/cd.yml` on pushes to `main`.

## Database Migrations

Run migrations for each data-owning service:

```bash
cd services/auth-service
source .venv/bin/activate
alembic upgrade head
cd ../workflow-service
alembic upgrade head
cd ../execution-service
alembic upgrade head
cd ../billing-service
alembic upgrade head
cd ../notification-service
alembic upgrade head
```

In ECS, migrations run as one-off tasks or as part of the deployment pipeline.

## Monitoring

- Logs: CloudWatch Logs under `/ecs/chainchat/<service>`
- Errors: Sentry (add `SENTRY_DSN` to service env)
- Metrics: CloudWatch metrics / custom metric logs

## Common Commands

```bash
# View gateway logs
aws logs tail /ecs/chainchat/gateway --follow

# Scale a service
aws ecs update-service --cluster chainchat --service execution-service --desired-count 3

# Restart all services
for svc in gateway auth-service workflow-service execution-service billing-service notification-service; do
  aws ecs update-service --cluster chainchat --service $svc --force-new-deployment
done
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 401 on all API calls | Clerk JWKS URL missing or wrong | Check `CLERK_JWKS_URL` in gateway |
| 503 from gateway | Upstream service unhealthy | Check ECS task health, CloudWatch logs |
| DB connection errors | RDS security group or credentials | Verify `DATABASE_URL` and SG rules |
| Frontend blank | Missing Clerk publishable key | Check `VITE_CLERK_PUBLISHABLE_KEY` |
| AI execution fails | Missing/invalid OpenRouter key (`OPENAI_API_KEY`) or retired model id | Check execution-service env; verify model IDs at openrouter.ai/models |
| Executions stuck in `pending` | RQ worker not consuming the `execution` queue | Run the `execution-worker` service (included in docker-compose) or `rq worker execution` |
| Local tests/dev hit the wrong database (`ModuleNotFoundError: psycopg`, foreign DB names) | Global `DATABASE_URL`/`REDIS_URL` env vars override each service's `.env` | Clear or override them before running locally (see README "Local gotcha") |
| Webhook calls 404/401 through the gateway | Known bug BUG-01 (routing + auth-skip) | See `docs/audit/AUDIT.md`; fix tracked in `docs/audit/IMPLEMENTATION-PLAN.md` P1 |