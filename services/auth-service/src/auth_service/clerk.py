"""Thin async client for the Clerk Backend API.

Clerk is the source of truth for identities, so the admin console reads the user
directory from Clerk and stores only ChainChat-specific state (Pro grants)
locally.
"""

from typing import Any

import httpx
import structlog

from src.auth_service.config import settings

logger = structlog.get_logger()


class ClerkNotConfiguredError(RuntimeError):
    """Raised when no Clerk secret key is available."""


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.clerk_secret_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        # Clerk's edge rejects default library user agents with HTTP 403
        # (error 1010), so identify the caller explicitly.
        "User-Agent": "ChainChat-AuthService/1.0",
    }


def is_configured() -> bool:
    key = settings.clerk_secret_key
    return bool(key) and "placeholder" not in key


def primary_email(payload: dict[str, Any]) -> str | None:
    """Pick the user's primary email address from a Clerk user object."""
    addresses = payload.get("email_addresses") or []
    primary_id = payload.get("primary_email_address_id")
    for address in addresses:
        if primary_id and address.get("id") == primary_id:
            return address.get("email_address")
    return addresses[0].get("email_address") if addresses else None


def display_name(payload: dict[str, Any]) -> str | None:
    parts = [payload.get("first_name"), payload.get("last_name")]
    name = " ".join(p for p in parts if p).strip()
    return name or payload.get("username") or None


async def get_user(clerk_id: str) -> dict[str, Any] | None:
    """Fetch a single Clerk user, or None when it does not exist."""
    if not is_configured():
        raise ClerkNotConfiguredError("CLERK_SECRET_KEY is not set")

    async with httpx.AsyncClient(base_url=settings.clerk_api_url, timeout=15.0) as client:
        response = await client.get(f"/users/{clerk_id}", headers=_headers())
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()


async def list_users(
    query: str | None = None, limit: int = 50, offset: int = 0
) -> list[dict[str, Any]]:
    """List Clerk users, optionally filtered by Clerk's free-text query."""
    if not is_configured():
        raise ClerkNotConfiguredError("CLERK_SECRET_KEY is not set")

    params: dict[str, Any] = {
        "limit": max(1, min(limit, 100)),
        "offset": max(0, offset),
        "order_by": "-created_at",
    }
    if query:
        params["query"] = query

    async with httpx.AsyncClient(base_url=settings.clerk_api_url, timeout=20.0) as client:
        response = await client.get("/users", headers=_headers(), params=params)
        response.raise_for_status()
        payload = response.json()

    # Clerk returns a bare list for this endpoint.
    if isinstance(payload, dict):
        return payload.get("data", [])
    return payload
