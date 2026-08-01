import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth_service import entitlements
from src.auth_service.db import get_db
from src.auth_service.schemas import MeRead

logger = structlog.get_logger()
router = APIRouter()


@router.get("/me", response_model=MeRead)
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    """The authenticated user, synced from Clerk, with admin flag and plan.

    Clerk webhooks are not reachable in local development, so the local user
    mirror is refreshed just-in-time from the authenticated request.
    """
    clerk_id = request.headers.get("x-user-id")
    if not clerk_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing x-user-id header"
        )

    user, email = await entitlements.sync_user_from_clerk(db, clerk_id)
    entitlement = await entitlements.resolve_entitlement(db, clerk_id)

    return MeRead(
        id=user.id,
        clerk_id=user.clerk_id,
        email=email or user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        created_at=user.created_at,
        is_admin=entitlements.is_admin_email(email),
        plan=entitlement.plan,
        pro_expires_at=entitlement.pro_expires_at,
    )


@router.get("/{clerk_id}/entitlement")
async def get_entitlement(clerk_id: str, db: AsyncSession = Depends(get_db)):
    """Entitlement lookup for other services (plan + expiry only)."""
    entitlement = await entitlements.resolve_entitlement(db, clerk_id)
    return {
        "clerk_id": clerk_id,
        "plan": entitlement.plan,
        "pro_expires_at": entitlement.pro_expires_at,
    }
