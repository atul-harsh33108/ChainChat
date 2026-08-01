"""System-admin console API: user directory and time-limited Pro grants.

Authorization: the caller's Clerk ID arrives as ``x-user-id`` (injected by the
gateway after verifying the JWT). Their email is read from Clerk and matched
against the ADMIN_EMAILS allow-list, so admin rights live in configuration and
cannot be escalated by modifying application data.
"""

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth_service import clerk, entitlements
from src.auth_service.db import get_db
from src.auth_service.models import ProGrant
from src.auth_service.schemas import (
    AdminUserRead,
    GrantProRequest,
    GrantProResponse,
    ProGrantRead,
    RevokeProResponse,
)

logger = structlog.get_logger()
router = APIRouter()


def _caller_id(request: Request) -> str:
    clerk_id = request.headers.get("x-user-id")
    if not clerk_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing x-user-id header"
        )
    return clerk_id


async def require_admin(request: Request, db: AsyncSession = Depends(get_db)) -> str:
    """FastAPI dependency that allows only configured admin emails."""
    clerk_id = _caller_id(request)
    _, email = await entitlements.sync_user_from_clerk(db, clerk_id)

    if not entitlements.is_admin_email(email):
        logger.warning("admin_access_denied", clerk_id=clerk_id, email=email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return clerk_id


def _parse_clerk_ts(value: int | None) -> datetime | None:
    """Clerk returns epoch milliseconds."""
    if not value:
        return None
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc)


@router.get("/users", response_model=list[AdminUserRead])
async def list_users(
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List users from Clerk, merged with their local Pro entitlement."""
    try:
        people = await clerk.list_users(query=query, limit=limit, offset=offset)
    except clerk.ClerkNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("clerk_list_users_failed", error=str(exc))
        raise HTTPException(status_code=502, detail="Could not reach Clerk") from exc

    out: list[AdminUserRead] = []
    for person in people:
        clerk_id = person.get("id")
        if not clerk_id:
            continue
        email = clerk.primary_email(person)
        entitlement = await entitlements.resolve_entitlement(db, clerk_id)
        out.append(
            AdminUserRead(
                clerk_id=clerk_id,
                email=email,
                name=clerk.display_name(person),
                avatar_url=person.get("image_url"),
                created_at=_parse_clerk_ts(person.get("created_at")),
                last_sign_in_at=_parse_clerk_ts(person.get("last_sign_in_at")),
                is_admin=entitlements.is_admin_email(email),
                plan=entitlement.plan,
                pro_expires_at=entitlement.pro_expires_at,
            )
        )

    logger.info("admin_users_listed", count=len(out), admin=admin)
    return out


@router.post("/users/{clerk_id}/pro", response_model=GrantProResponse)
async def grant_pro(
    clerk_id: str,
    payload: GrantProRequest,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Grant (or extend) Pro access for a fixed number of days."""
    try:
        grant = await entitlements.grant_pro(
            db, clerk_id, days=payload.days, granted_by=admin, reason=payload.reason
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return GrantProResponse(
        clerk_id=clerk_id,
        plan="pro",
        pro_expires_at=grant.expires_at,
        grant=ProGrantRead.model_validate(grant),
    )


@router.post("/users/{clerk_id}/pro/revoke", response_model=RevokeProResponse)
async def revoke_pro(
    clerk_id: str,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revoke all active Pro grants for a user, effective immediately."""
    revoked = await entitlements.revoke_pro(db, clerk_id, revoked_by=admin)
    return RevokeProResponse(clerk_id=clerk_id, plan="free", revoked=revoked)


@router.get("/users/{clerk_id}/grants", response_model=list[ProGrantRead])
async def user_grants(
    clerk_id: str,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Full grant history for one user (including revoked and expired)."""
    result = await db.execute(
        select(ProGrant)
        .where(ProGrant.clerk_id == clerk_id)
        .order_by(desc(ProGrant.created_at))
    )
    return result.scalars().all()


@router.get("/grants", response_model=list[ProGrantRead])
async def all_grants(
    limit: int = 100,
    admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Recent grant activity across all users."""
    result = await db.execute(
        select(ProGrant).order_by(desc(ProGrant.created_at)).limit(max(1, min(limit, 500)))
    )
    return result.scalars().all()
