"""Proxy routing and auth-skip tests (BUG-01).

Upstreams are faked with an httpx MockTransport injected in place of the
lifespan-managed client, so no real services need to run.
"""

import httpx
import pytest
from jose import jwt

from src.gateway import main
from src.gateway.main import app


def make_token(**claims) -> str:
    """A well-formed JWT. With no real CLERK_JWKS_URL the gateway decodes
    without verifying the signature (dev bypass), so any signature works."""
    payload = {"sub": "user_1", "org_id": "org_1", "org_role": "org:admin"}
    payload.update(claims)
    return jwt.encode(payload, "test-secret", algorithm="HS256")


@pytest.fixture
def upstream(monkeypatch):
    """Inject a recording fake upstream and force dev-bypass token handling."""
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"ok": True, "path": request.url.path})

    monkeypatch.setattr(
        main, "http_client", httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    monkeypatch.setattr(main.settings, "clerk_jwks_url", "")
    return requests


def api_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_clerk_webhook_proxied_without_token(upstream):
    async with api_client() as client:
        resp = await client.post("/api/v1/webhooks/clerk", json={"type": "user.created"})

    assert resp.status_code == 200
    assert len(upstream) == 1
    assert upstream[0].url.path == "/api/v1/webhooks/clerk"
    assert upstream[0].url.port == 8001  # auth-service


@pytest.mark.asyncio
async def test_stripe_webhook_proxied_without_token(upstream):
    async with api_client() as client:
        resp = await client.post("/api/v1/billing/webhooks/stripe", content=b"{}")

    assert resp.status_code == 200
    assert len(upstream) == 1
    assert upstream[0].url.path == "/api/v1/billing/webhooks/stripe"
    assert upstream[0].url.port == 8004  # billing-service


@pytest.mark.asyncio
async def test_authenticated_request_proxies_identity_headers(upstream):
    async with api_client() as client:
        resp = await client.get(
            "/api/v1/users/me", headers={"Authorization": f"Bearer {make_token()}"}
        )

    assert resp.status_code == 200
    assert len(upstream) == 1
    assert upstream[0].headers["x-user-id"] == "user_1"
    assert upstream[0].headers["x-workspace-id"] == "org_1"
    assert upstream[0].headers["x-role"] == "org:admin"


@pytest.mark.asyncio
async def test_missing_token_rejected(upstream):
    async with api_client() as client:
        resp = await client.get("/api/v1/users/me")

    assert resp.status_code == 401
    assert upstream == []  # never reaches the upstream


@pytest.mark.asyncio
async def test_unknown_prefix_404(upstream):
    async with api_client() as client:
        resp = await client.get(
            "/api/v1/nope", headers={"Authorization": f"Bearer {make_token()}"}
        )

    assert resp.status_code == 404
    assert upstream == []


@pytest.mark.asyncio
async def test_upstream_unreachable_returns_503(monkeypatch):
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(
        main, "http_client", httpx.AsyncClient(transport=httpx.MockTransport(fail))
    )
    monkeypatch.setattr(main.settings, "clerk_jwks_url", "")

    async with api_client() as client:
        resp = await client.get(
            "/api/v1/users/me", headers={"Authorization": f"Bearer {make_token()}"}
        )

    assert resp.status_code == 503