"""Tests for template endpoints (BUG-05 / FEAT-06).

The DB session is replaced with a minimal fake via dependency_overrides, so no
database is needed.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.workflow_service.db import get_db
from src.workflow_service.main import app
from src.workflow_service.models import Template


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    """Just enough of AsyncSession for the apply endpoint."""

    def __init__(self, template=None):
        self._template = template
        self.added = []
        self.committed = False

    async def execute(self, _stmt):
        return _FakeResult(self._template)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        self.committed = True

    async def refresh(self, _obj):
        pass


def _sample_template() -> Template:
    now = datetime.now(timezone.utc)
    return Template(
        id=uuid4(),
        name="Sample",
        description="demo",
        category="demo",
        tags=["demo"],
        graph={
            "nodes": [
                {"id": "start", "type": "start", "position": {"x": 0, "y": 0}, "config": {}}
            ],
            "edges": [],
        },
        meta_data=None,
        is_public=True,
        created_by=uuid4(),
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_apply_template_creates_workflow_and_version():
    template = _sample_template()
    fake = _FakeSession(template)
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/templates/{template.id}/apply",
                json={"workspace_id": str(uuid4()), "owner_id": str(uuid4())},
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Sample"
    workflow, version = fake.added
    assert str(workflow.id) == body["workflow_id"]
    assert str(version.id) == body["version_id"]
    assert version.version_number == 1
    assert version.graph == template.graph
    assert version.workflow_id == workflow.id
    assert workflow.root_version_id == version.id
    assert fake.committed


@pytest.mark.asyncio
async def test_apply_unknown_template_returns_404():
    fake = _FakeSession(None)
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/templates/{uuid4()}/apply",
                json={"workspace_id": str(uuid4()), "owner_id": str(uuid4())},
                headers={"x-user-id": "user_test"},
            )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_apply_requires_user_header():
    fake = _FakeSession(_sample_template())
    app.dependency_overrides[get_db] = lambda: fake
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"/api/v1/templates/{uuid4()}/apply",
                json={"workspace_id": str(uuid4()), "owner_id": str(uuid4())},
            )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 401