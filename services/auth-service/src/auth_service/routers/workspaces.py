import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth_service import authorization
from src.auth_service.db import get_db
from src.auth_service.entitlements import sync_user_from_clerk
from src.auth_service.models import AuditLog, Membership, User, Workspace, WorkspaceInvite
from src.auth_service.schemas import (
    MembershipCreate,
    MembershipRead,
    MembershipUpdate,
    WorkspaceCreate,
    WorkspaceInviteAccept,
    WorkspaceInviteRead,
    WorkspaceRead,
)

logger = structlog.get_logger()
router = APIRouter()

INVITE_TTL_DAYS = 7


def _slugify(name: str) -> str:
    slug = "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-")
    return slug[:200] or "workspace"


async def _require_workspace(
    db: AsyncSession, workspace_id: UUID
) -> Workspace:
    workspace = await authorization.get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


async def _require_role(
    db: AsyncSession, workspace_id: UUID, user_id: UUID, minimum: str
) -> Membership:
    membership = await authorization.get_membership(db, workspace_id, user_id)
    if not membership or not authorization.role_at_least(membership.role, minimum):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least '{minimum}' role",
        )
    return membership


async def _sync_current_user(db: AsyncSession, request: Request) -> User:
    clerk_id = request.headers.get("x-user-id")
    if not clerk_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing x-user-id header"
        )
    user, _ = await sync_user_from_clerk(db, clerk_id)
    return user


@router.get("", response_model=list[WorkspaceRead])
async def list_workspaces(request: Request, db: AsyncSession = Depends(get_db)):
    user = await _sync_current_user(db, request)
    result = await db.execute(
        select(Workspace)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .where(Membership.user_id == user.id)
        .order_by(Workspace.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    request: Request, payload: WorkspaceCreate, db: AsyncSession = Depends(get_db)
):
    user = await _sync_current_user(db, request)
    slug = payload.slug or _slugify(payload.name)

    # Ensure slug uniqueness by appending a short suffix on collision.
    base_slug = slug
    suffix = 1
    while True:
        existing = await db.scalar(select(Workspace).where(Workspace.slug == slug))
        if existing is None:
            break
        suffix += 1
        slug = f"{base_slug}-{suffix}"

    workspace = Workspace(
        id=uuid4(),
        name=payload.name,
        slug=slug,
        plan="free",
        subscription_status="active",
    )
    db.add(workspace)
    await db.flush()

    db.add(
        Membership(
            id=uuid4(),
            user_id=user.id,
            workspace_id=workspace.id,
            role="owner",
        )
    )
    db.add(
        AuditLog(
            id=uuid4(),
            workspace_id=workspace.id,
            actor_id=user.id,
            action="workspace_created",
            target_type="workspace",
            target_id=str(workspace.id),
        )
    )
    await db.commit()
    await db.refresh(workspace)
    logger.info("workspace_created", workspace_id=str(workspace.id), user_id=str(user.id))
    return workspace


@router.get("/{workspace_id}/members/me", response_model=MembershipRead)
async def get_my_membership(
    request: Request, workspace_id: UUID, db: AsyncSession = Depends(get_db)
):
    """Return the calling user's membership in a workspace, or 404 if none.

    This is the endpoint other services use to resolve a user's role without
    touching the ``auth`` schema directly.
    """
    user = await _sync_current_user(db, request)
    membership = await authorization.get_membership(db, workspace_id, user.id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not a member of this workspace"
        )
    return membership


@router.get("/{workspace_id}/members", response_model=list[MembershipRead])
async def list_members(
    request: Request, workspace_id: UUID, db: AsyncSession = Depends(get_db)
):
    user = await _sync_current_user(db, request)
    await _require_workspace(db, workspace_id)
    await _require_role(db, workspace_id, user.id, "viewer")
    result = await db.execute(
        select(Membership)
        .where(Membership.workspace_id == workspace_id)
        .order_by(Membership.created_at)
    )
    return result.scalars().all()


@router.post(
    "/{workspace_id}/members",
    response_model=WorkspaceInviteRead,
    status_code=status.HTTP_201_CREATED,
)
async def invite_member(
    request: Request,
    workspace_id: UUID,
    payload: MembershipCreate,
    db: AsyncSession = Depends(get_db),
):
    user = await _sync_current_user(db, request)
    await _require_workspace(db, workspace_id)
    await _require_role(db, workspace_id, user.id, "owner")

    # Reject if the target email is already a member.
    existing = await db.execute(
        select(Membership)
        .join(User, User.id == Membership.user_id)
        .where(Membership.workspace_id == workspace_id, User.email == payload.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User is already a member"
        )

    invite = WorkspaceInvite(
        id=uuid4(),
        workspace_id=workspace_id,
        email=payload.email,
        role=payload.role,
        token=secrets.token_urlsafe(32),
        invited_by=user.id,
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS),
    )
    db.add(invite)
    db.add(
        AuditLog(
            id=uuid4(),
            workspace_id=workspace_id,
            actor_id=user.id,
            action="member_invited",
            target_type="workspace",
            target_id=str(workspace_id),
            meta_data={"email": payload.email, "role": payload.role},
        )
    )
    await db.commit()
    await db.refresh(invite)
    logger.info(
        "member_invited",
        workspace_id=str(workspace_id),
        email=payload.email,
        role=payload.role,
        actor=str(user.id),
    )
    return invite


@router.post("/{workspace_id}/invites/accept", response_model=MembershipRead)
async def accept_invite(
    request: Request,
    workspace_id: UUID,
    payload: WorkspaceInviteAccept,
    db: AsyncSession = Depends(get_db),
):
    user = await _sync_current_user(db, request)
    await _require_workspace(db, workspace_id)

    invite = await db.scalar(
        select(WorkspaceInvite).where(
            WorkspaceInvite.workspace_id == workspace_id,
            WorkspaceInvite.token == payload.token,
        )
    )
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    if invite.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite already used")

    if invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite expired")

    # Ensure the accepting user's email matches the invite (or the invite was
    # created for a not-yet-registered email that now resolves to this user).
    if invite.email.lower() != user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invite was issued for a different email address",
        )

    membership = Membership(
        id=uuid4(),
        user_id=user.id,
        workspace_id=workspace_id,
        role=invite.role,
    )
    invite.status = "accepted"
    invite.accepted_at = datetime.now(timezone.utc)
    db.add(membership)
    db.add(
        AuditLog(
            id=uuid4(),
            workspace_id=workspace_id,
            actor_id=user.id,
            action="member_joined",
            target_type="workspace",
            target_id=str(workspace_id),
            meta_data={"role": invite.role},
        )
    )
    await db.commit()
    await db.refresh(membership)
    logger.info("member_joined", workspace_id=str(workspace_id), user_id=str(user.id))
    return membership


@router.patch("/{workspace_id}/members/{member_id}", response_model=MembershipRead)
async def update_member_role(
    request: Request,
    workspace_id: UUID,
    member_id: UUID,
    payload: MembershipUpdate,
    db: AsyncSession = Depends(get_db),
):
    user = await _sync_current_user(db, request)
    await _require_workspace(db, workspace_id)
    await _require_role(db, workspace_id, user.id, "owner")

    membership = await db.scalar(
        select(Membership).where(
            Membership.id == member_id,
            Membership.workspace_id == workspace_id,
        )
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    membership.role = payload.role
    db.add(
        AuditLog(
            id=uuid4(),
            workspace_id=workspace_id,
            actor_id=user.id,
            action="member_role_changed",
            target_type="membership",
            target_id=str(member_id),
            meta_data={"role": payload.role},
        )
    )
    await db.commit()
    await db.refresh(membership)
    logger.info(
        "member_role_changed",
        workspace_id=str(workspace_id),
        member_id=str(member_id),
        role=payload.role,
    )
    return membership


@router.delete("/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    request: Request,
    workspace_id: UUID,
    member_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    user = await _sync_current_user(db, request)
    await _require_workspace(db, workspace_id)
    await _require_role(db, workspace_id, user.id, "owner")

    membership = await db.scalar(
        select(Membership).where(
            Membership.id == member_id,
            Membership.workspace_id == workspace_id,
        )
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Prevent removing the last owner.
    if membership.role == "owner":
        owners = await db.execute(
            select(Membership).where(
                Membership.workspace_id == workspace_id, Membership.role == "owner"
            )
        )
        if len(owners.scalars().all()) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot remove the last owner of a workspace",
            )

    await db.delete(membership)
    db.add(
        AuditLog(
            id=uuid4(),
            workspace_id=workspace_id,
            actor_id=user.id,
            action="member_removed",
            target_type="membership",
            target_id=str(member_id),
        )
    )
    await db.commit()
    logger.info(
        "member_removed", workspace_id=str(workspace_id), member_id=str(member_id)
    )
    return None