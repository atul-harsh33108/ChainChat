"""Billing endpoint tests (BUG-06): placeholder behavior + Clerk-ID coercion.

Stripe is forced into unconfigured mode, so endpoints exercise their
placeholder paths; no database or network needed (session faked via
dependency_overrides).
"""

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.billing_service.config import settings
from src.billing_service.db import get_db
from src.billing_service.main import app


class _FakeResult:
    def scalar_one_or_none(self):
        return None

    def scalars(self):
        return self

    def all(self):
        return []


class _FakeSession:
    async def execute(self, _stmt):
        return _FakeResult()


@pytest.fixture(autouse=True)
def placeholder_mode(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    monkeypatch.setattr(settings, "stripe_price_id", "")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "")
    app.dependency_overrides[get_db] = lambda: _FakeSession()
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_checkout_placeholder_accepts_clerk_workspace_id():
    """A Clerk org id (not a UUID) must be coerced, not rejected with 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/billing/checkout",
            json={"workspace_id": "org_2abcDEF", "success_url": "http://x/ok", "cancel_url": "http://x/no"},
        )
    assert resp.status_code == 200
    assert resp.json()["session_id"] == "cs_placeholder"


@pytest.mark.asyncio
async def test_checkout_placeholder_accepts_uuid():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/billing/checkout", json={"workspace_id": str(uuid4())})
    assert resp.status_code == 200
    assert resp.json()["session_id"] == "cs_placeholder"


@pytest.mark.asyncio
async def test_portal_placeholder_echoes_return_url():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/billing/portal",
            json={"workspace_id": "org_2abcDEF", "return_url": "http://x/back"},
        )
    assert resp.status_code == 200
    assert resp.json()["url"] == "http://x/back"


@pytest.mark.asyncio
async def test_subscription_free_fallback_with_clerk_workspace_id():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(
            "/api/v1/billing/subscription", headers={"x-workspace-id": "org_2abcDEF"}
        )
    assert resp.status_code == 200
    assert resp.json()["plan"] == "free"


@pytest.mark.asyncio
async def test_usage_with_clerk_workspace_id_returns_empty_list():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(
            "/api/v1/billing/usage", headers={"x-workspace-id": "org_2abcDEF"}
        )
    assert resp.status_code == 200
    assert resp.json() == []