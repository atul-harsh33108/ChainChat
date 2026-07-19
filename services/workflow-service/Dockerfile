FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY src/ ./src/

FROM base AS dev
RUN pip install --no-cache-dir -r requirements-dev.txt
CMD ["uvicorn", "src.workflow_service.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "src.workflow_service.main:app"]
