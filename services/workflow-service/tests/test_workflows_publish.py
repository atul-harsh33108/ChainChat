"""Tests for publish/unpublish endpoints (GAP-07, slice A).

The DB session is replaced with a minimal fake via dependency_overrides, so no
database is needed, following the convention in test_templates.py.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.workflow_service.db import get_db
from src.workflow_service.main import app
from src.workflow_service.models import Workflow, WorkflowVersion


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    """Just enough of AsyncSession for the publish/unpublish endpoints.

    `_results` is a queue: each `execute()` call pops the next configured
    return value, mirroring the two sequential queries (workflow, then
    version) that `publish_workflow_version` issues.
    """

    def __init__(self, results):
        self._results = list(results)
        self.committed = False

    async def execute(self, _stmt):
        value = self._results.pop(0)
        return _FakeResult(value)

    async def commit(self):
        self.committed = True

    async def refresh(self, _obj):
        pass


def _sample_workflow(published_version_id=None) -> Workflow:
    now = datetime.now(timezone.utc)
    return Workflow(
        id=uuid4(),
        workspace_id=uuid4(),
        owner_id=uuid4(),
        name="Sample workflow",
        description=None,
        is_template=False,
        parent_id=None,
        root_version_id=None,
        published_version_id=published_version_id,
        meta_data=None,
        created_at=now,
        updated_at=now,
    )


def _sample_version(workflow_id) -> WorkflowVersion:
    now = datetime.now(timezone.utc)
    return WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow_id,
        version_number=1,
        name="v1",
        description=None,
        change_summary=None,
        status="draft",
        graph={"nodes": [], "edges": []},
        meta_data=None,
        created_by=uuid4(),
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_publish_sets_published_version_id():
    workflow = _sample_workflow()
    version = _sample_version(workflow.id)
    fake = _FakeSession([workflow, version])
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/workflows/{workflow.id}/versions/{version.id}/publish",
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["published_version_id"] == str(version.id)
    assert workflow.published_version_id == version.id
    assert fake.committed


@pytest.mark.asyncio
async def test_publish_unknown_workflow_returns_404():
    fake = _FakeSession([None])
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/workflows/{uuid4()}/versions/{uuid4()}/publish",
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_publish_version_not_on_workflow_returns_404():
    workflow = _sample_workflow()
    fake = _FakeSession([workflow, None])
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/workflows/{workflow.id}/versions/{uuid4()}/publish",
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_unpublish_clears_published_version_id():
    version_id = uuid4()
    workflow = _sample_workflow(published_version_id=version_id)
    fake = _FakeSession([workflow])
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/workflows/{workflow.id}/versions/{version_id}/unpublish",
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    body = resp.json()
    assert body["published_version_id"] is None
    assert workflow.published_version_id is None
    assert fake.committed


@pytest.mark.asyncio
async def test_unpublish_wrong_version_returns_409():
    published_id = uuid4()
    workflow = _sample_workflow(published_version_id=published_id)
    fake = _FakeSession([workflow])
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/workflows/{workflow.id}/versions/{uuid4()}/unpublish",
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 409
    # The published version is untouched by a rejected unpublish.
    assert workflow.published_version_id == published_id


@pytest.mark.asyncio
async def test_publish_requires_user_header():
    workflow = _sample_workflow()
    version = _sample_version(workflow.id)
    fake = _FakeSession([workflow, version])
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/workflows/{workflow.id}/versions/{version.id}/publish",
            )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 401
