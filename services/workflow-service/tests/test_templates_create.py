"""Tests for POST /templates (GAP-07, slice B).

The DB session is replaced with a minimal fake via dependency_overrides, so no
database is needed, following the convention in test_templates.py.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import IntegrityError

from src.workflow_service.db import get_db
from src.workflow_service.main import app
from src.workflow_service.models import Workflow


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    """Just enough of AsyncSession for the create-template endpoint.

    `_results` is a queue: each `execute()` call pops the next configured
    return value, mirroring the optional source-workflow lookup that precedes
    the insert. `commit_error`, if set, is raised once from `commit()` (to
    simulate a unique-name constraint violation).
    """

    def __init__(self, results=None, commit_error=None):
        self._results = list(results or [])
        self.added = []
        self.committed = False
        self.rolled_back = False
        self._commit_error = commit_error

    async def execute(self, _stmt):
        value = self._results.pop(0)
        return _FakeResult(value)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        if self._commit_error is not None:
            err = self._commit_error
            self._commit_error = None
            raise err
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    async def refresh(self, obj):
        # Simulate the DB applying mapped_column server-side defaults
        # (created_at/updated_at) on flush, since this fake never actually
        # inserts a row.
        now = datetime.now(timezone.utc)
        if getattr(obj, "created_at", None) is None:
            obj.created_at = now
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = now


def _sample_workflow() -> Workflow:
    now = datetime.now(timezone.utc)
    return Workflow(
        id=uuid4(),
        workspace_id=uuid4(),
        owner_id=uuid4(),
        name="Source workflow",
        description=None,
        is_template=False,
        parent_id=None,
        root_version_id=None,
        published_version_id=None,
        meta_data=None,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_create_template_without_source_workflow():
    fake = _FakeSession()
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/templates",
                json={
                    "name": "Blog post pipeline",
                    "description": "demo",
                    "category": "content",
                    "tags": ["blog"],
                    "graph": {"nodes": [], "edges": []},
                    "is_public": True,
                },
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Blog post pipeline"
    assert body["source_workflow_id"] is None
    (template,) = fake.added
    assert template.name == "Blog post pipeline"
    assert template.graph == {"nodes": [], "edges": []}
    assert fake.committed


@pytest.mark.asyncio
async def test_create_template_from_source_workflow():
    workflow = _sample_workflow()
    fake = _FakeSession(results=[workflow])
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/templates",
                json={
                    "name": "From workflow",
                    "graph": {"nodes": [{"id": "start", "type": "start"}], "edges": []},
                    "source_workflow_id": str(workflow.id),
                },
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 201
    body = resp.json()
    assert body["source_workflow_id"] == str(workflow.id)
    (template,) = fake.added
    assert template.source_workflow_id == workflow.id


@pytest.mark.asyncio
async def test_create_template_unknown_source_workflow_returns_404():
    fake = _FakeSession(results=[None])
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/templates",
                json={
                    "name": "Orphaned",
                    "graph": {"nodes": [], "edges": []},
                    "source_workflow_id": str(uuid4()),
                },
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 404
    assert fake.added == []


@pytest.mark.asyncio
async def test_create_template_duplicate_name_returns_409():
    fake = _FakeSession(commit_error=IntegrityError("duplicate name", None, None))
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/templates",
                json={"name": "Existing name", "graph": {"nodes": [], "edges": []}},
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 409
    assert fake.rolled_back


@pytest.mark.asyncio
async def test_create_template_requires_user_header():
    fake = _FakeSession()
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/templates",
                json={"name": "No auth", "graph": {"nodes": [], "edges": []}},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 401
