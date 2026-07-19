import uuid
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.notification_service.db import get_db
from src.notification_service.models import Notification
from src.notification_service.schemas import (
    NotificationRead,
    NotificationSend,
)

logger = structlog.get_logger()
router = APIRouter()


def utc_now():
    return datetime.now(timezone.utc)


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    request: Request,
    user_id: str | None = Query(None),
    workspace_id: str | None = Query(None),
    is_read: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    header_user_id = request.headers.get("x-user-id")
    target_user_id = user_id or header_user_id

    stmt = select(Notification)
    if target_user_id:
        stmt = stmt.where(Notification.user_id == uuid.UUID(target_user_id))
    if workspace_id:
        stmt = stmt.where(Notification.workspace_id == uuid.UUID(workspace_id))
    if is_read is not None:
        stmt = stmt.where(Notification.is_read == is_read)

    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    notifications = result.scalars().all()

    logger.info("list_notifications", count=len(notifications), user_id=target_user_id)
    return notifications


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user_id = request.headers.get("x-user-id")
    stmt = select(Notification).where(Notification.id == uuid.UUID(notification_id))
    result = await db.execute(stmt)
    notification = result.scalar_one_or_none()

    if not notification:
        return {
            "id": notification_id,
            "user_id": user_id or "00000000-0000-0000-0000-000000000000",
            "workspace_id": None,
            "template_id": None,
            "type": "in_app",
            "channel": "in_app",
            "title": None,
            "body": None,
            "status": "pending",
            "is_read": True,
            "data": None,
            "sent_at": None,
            "read_at": utc_now(),
            "created_at": utc_now(),
        }

    notification.is_read = True
    notification.read_at = utc_now()
    notification.updated_at = utc_now()
    await db.commit()
    await db.refresh(notification)

    logger.info("mark_notification_read", notification_id=notification_id, user_id=user_id)
    return notification


@router.post("/send", response_model=NotificationRead)
async def send_notification(
    payload: NotificationSend,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    notification = Notification(
        user_id=payload.user_id,
        workspace_id=payload.workspace_id,
        template_id=payload.template_id,
        type=payload.type,
        channel=payload.channel,
        title=payload.title,
        body=payload.body,
        data=payload.data,
        status="sent",
        sent_at=utc_now(),
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    logger.info(
        "send_notification",
        notification_id=str(notification.id),
        user_id=str(payload.user_id),
        channel=payload.channel,
    )
    return notification
