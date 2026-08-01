"""Pro entitlement resolution and local user synchronisation."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth_service import clerk
from src.auth_service.config import settings
from src.auth_service.models import AuditLog, ProGrant, User

logger = structlog.get_logger()

MAX_GRANT_DAYS = 3650


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    """Treat naive timestamps from the DB as UTC so comparisons never raise."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@dataclass
class Entitlement:
    plan: str
    pro_expires_at: datetime | None
    grant_id: str | None = None

    @property
    def is_pro(self) -> bool:
        return self.plan == "pro"


def is_admin_email(email: str | None) -> bool:
    if not email:
        return False
    return email.strip().lower() in settings.admin_email_set


async def active_grant(session: AsyncSession, clerk_id: str) -> ProGrant | None:
    """Return the currently active Pro grant for a user, if any.

    Filtering happens in Python rather than SQL so that naive/aware timestamp
    mismatches cannot silently exclude rows.
    """
    result = await session.execute(
        select(ProGrant)
        .where(ProGrant.clerk_id == clerk_id, ProGrant.revoked_at.is_(None))
        .order_by(ProGrant.expires_at.desc())
    )
    now = utc_now()
    for grant in result.scalars().all():
        starts = _aware(grant.starts_at)
        expires = _aware(grant.expires_at)
        if (starts is None or starts <= now) and expires and expires > now:
            return grant
    return None


async def resolve_entitlement(session: AsyncSession, clerk_id: str) -> Entitlement:
    grant = await active_grant(session, clerk_id)
    if grant:
        return Entitlement(
            plan="pro", pro_expires_at=_aware(grant.expires_at), grant_id=str(grant.id)
        )
    return Entitlement(plan="free", pro_expires_at=None)


async def upsert_user(
    session: AsyncSession,
    clerk_id: str,
    email: str | None = None,
    name: str | None = None,
    avatar_url: str | None = None,
) -> User:
    """Create or refresh the local mirror of a Clerk user.

    Clerk webhooks are not reachable in local development, so users are synced
    just-in-time from the authenticated request instead.
    """
    result = await session.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            id=uuid4(),
            clerk_id=clerk_id,
            # email is NOT NULL; fall back to a placeholder if Clerk is unavailable.
            email=email or f"{clerk_id}@unknown.local",
            name=name,
            avatar_url=avatar_url,
        )
        session.add(user)
    else:
        if email:
            user.email = email
        if name:
            user.name = name
        if avatar_url:
            user.avatar_url = avatar_url

    await session.commit()
    await session.refresh(user)
    return user


async def sync_user_from_clerk(session: AsyncSession, clerk_id: str) -> tuple[User, str | None]:
    """Upsert the local user using fresh data from Clerk.

    Returns the user plus their Clerk email (needed for the admin check). Falls
    back to whatever is already stored when Clerk cannot be reached.
    """
    email: str | None = None
    name: str | None = None
    avatar: str | None = None

    if clerk.is_configured():
        try:
            payload = await clerk.get_user(clerk_id)
            if payload:
                email = clerk.primary_email(payload)
                name = clerk.display_name(payload)
                avatar = payload.get("image_url")
        except Exception as exc:  # network/permission issues must not 500 the app
            logger.warning("clerk_user_fetch_failed", clerk_id=clerk_id, error=str(exc))

    user = await upsert_user(session, clerk_id, email=email, name=name, avatar_url=avatar)
    resolved_email = email or (user.email if "@unknown.local" not in user.email else None)
    return user, resolved_email


async def grant_pro(
    session: AsyncSession,
    clerk_id: str,
    days: int,
    granted_by: str,
    reason: str | None = None,
) -> ProGrant:
    """Grant Pro for ``days`` days, extending any grant already active."""
    if days < 1 or days > MAX_GRANT_DAYS:
        raise ValueError(f"days must be between 1 and {MAX_GRANT_DAYS}")

    now = utc_now()
    existing = await active_grant(session, clerk_id)
    # Extend from the current expiry so stacking grants never shortens access.
    base = _aware(existing.expires_at) if existing else now
    if base is None or base < now:
        base = now

    result = await session.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()

    grant = ProGrant(
        id=uuid4(),
        user_id=user.id if user else None,
        clerk_id=clerk_id,
        granted_by=granted_by,
        reason=reason,
        starts_at=now,
        expires_at=base + timedelta(days=days),
    )
    session.add(grant)

    if existing:
        # Superseded by the extended grant.
        existing.revoked_at = now
        existing.revoked_by = granted_by

    session.add(
        AuditLog(
            id=uuid4(),
            actor_id=None,
            action="pro_grant_created",
            target_type="user",
            target_id=clerk_id,
            meta_data={
                "days": days,
                "granted_by": granted_by,
                "reason": reason,
                "expires_at": grant.expires_at.isoformat(),
            },
        )
    )

    await session.commit()
    await session.refresh(grant)
    logger.info(
        "pro_granted", clerk_id=clerk_id, days=days, expires_at=grant.expires_at.isoformat()
    )
    return grant


async def revoke_pro(session: AsyncSession, clerk_id: str, revoked_by: str) -> int:
    """Revoke every active grant for a user. Returns how many were revoked."""
    result = await session.execute(
        select(ProGrant).where(ProGrant.clerk_id == clerk_id, ProGrant.revoked_at.is_(None))
    )
    now = utc_now()
    revoked = 0
    for grant in result.scalars().all():
        expires = _aware(grant.expires_at)
        if expires and expires > now:
            grant.revoked_at = now
            grant.revoked_by = revoked_by
            revoked += 1

    if revoked:
        session.add(
            AuditLog(
                id=uuid4(),
                action="pro_grant_revoked",
                target_type="user",
                target_id=clerk_id,
                meta_data={"revoked_by": revoked_by, "count": revoked},
            )
        )

    await session.commit()
    logger.info("pro_revoked", clerk_id=clerk_id, count=revoked)
    return revoked
