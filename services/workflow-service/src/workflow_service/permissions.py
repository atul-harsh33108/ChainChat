"""Role resolution and authorization for workflow-service.

The workflow service does not own the ``auth`` schema, so membership/role lookups
are delegated to the auth-service over HTTP. The gateway injects ``x-user-id``
(the Clerk user ID) header; this module resolves the caller's role for a given
workspace and enforces minimum-role requirements.

The raw Clerk ID is forwarded to the auth-service verbatim, because the
auth-service resolves it to the internal user mirror itself. The internal UUID
(derived via ``to_uuid``) is only used for local persistence columns such as
``owner_id`` and ``created_by``.

Robustness note: ``httpx`` is imported lazily so that a container image that has
not yet been rebuilt with the new dependency still starts, and role resolution
degrades to the legacy fallback below rather than failing at import time.
"""

from uuid import UUID

import structlog
from fastapi import HTTPException, Request, status

from src.workflow_service.config import settings
from src.workflow_service.ids import to_uuid

logger = structlog.get_logger()

ROLE_ORDER = {"viewer": 0, "editor": 1, "owner": 2}


def role_at_least(role: str, minimum: str) -> bool:
    return ROLE_ORDER.get(role, -1) >= ROLE_ORDER.get(minimum, -1)


def current_clerk_id(request: Request) -> str:
    clerk_id = request.headers.get("x-user-id")
    if not clerk_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing x-user-id header"
        )
    return clerk_id


def current_user_id(request: Request) -> UUID:
    return to_uuid(current_clerk_id(request))


async def resolve_role(workspace_id: UUID, clerk_id: str) -> str | None:
    """Ask the auth-service for the caller's role in a workspace.

    Returns None when the user has no membership record, the workspace does not
    exist, the auth-service cannot be reached, or the optional ``httpx``
    dependency is unavailable. Callers decide whether to fall back to legacy
    ownership.
    """
    try:
        import httpx
    except ImportError:  # pragma: no cover - depends on the deployed image
        logger.warning("httpx_unavailable", workspace_id=str(workspace_id))
        return None

    url = f"{settings.auth_service_url}/api/v1/workspaces/{workspace_id}/members/me"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers={"x-user-id": clerk_id})
    except httpx.RequestError as exc:
        logger.warning("auth_service_unreachable", url=url, error=str(exc))
        return None

    if resp.status_code != 200:
        return None

    payload = resp.json()
    return payload.get("role")


async def require_role(
    request: Request, workspace_id: UUID, minimum: str
) -> UUID:
    """Enforce that the caller holds at least ``minimum`` role in ``workspace_id``.

    Returns the caller's internal user UUID on success.

    Legacy fallback: workspaces created before the membership system (personal
    workspaces keyed by a Clerk user id, and pre-existing org workspaces) have
    no membership rows, so role resolution returns None. To avoid locking those
    users out, the check falls back to the ``owner`` role in that case. This is
    no stricter than the pre-collaboration behaviour, which performed no
    authorization at all. Real enforcement activates once a workspace has
    membership records (i.e. after the owner uses the new invite flow).
    """
    clerk_id = current_clerk_id(request)
    role = await resolve_role(workspace_id, clerk_id)
    if role is None:
        logger.info(
            "membership_legacy_fallback",
            workspace_id=str(workspace_id),
            minimum=minimum,
        )
        role = "owner"
    if not role_at_least(role, minimum):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least '{minimum}' role",
        )
    return to_uuid(clerk_id)