"""Membership and role resolution helpers shared across auth-service routers."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth_service.models import Membership, Workspace

ROLE_ORDER = {"viewer": 0, "editor": 1, "owner": 2}


def role_at_least(role: str, minimum: str) -> bool:
    """Return True when ``role`` grants at least ``minimum`` privileges."""
    return ROLE_ORDER.get(role, -1) >= ROLE_ORDER.get(minimum, -1)


async def get_membership(
    session: AsyncSession, workspace_id: UUID, user_id: UUID
) -> Membership | None:
    result = await session.execute(
        select(Membership).where(
            Membership.workspace_id == workspace_id,
            Membership.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_role(session: AsyncSession, workspace_id: UUID, user_id: UUID) -> str | None:
    membership = await get_membership(session, workspace_id, user_id)
    return membership.role if membership else None


async def get_workspace(session: AsyncSession, workspace_id: UUID) -> Workspace | None:
    result = await session.execute(select(Workspace).where(Workspace.id == workspace_id))
    return result.scalar_one_or_none()