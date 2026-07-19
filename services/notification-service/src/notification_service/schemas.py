from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class NotificationTemplateRead(BaseModel):
    id: UUID
    name: str
    type: str
    channel: str
    subject: str | None
    body_html: str | None
    body_text: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationTemplateCreate(BaseModel):
    name: str
    type: str
    channel: str = "email"
    subject: str | None = None
    body_html: str | None = None
    body_text: str | None = None


class NotificationRead(BaseModel):
    id: UUID
    user_id: UUID
    workspace_id: UUID | None
    template_id: UUID | None
    type: str
    channel: str
    title: str | None
    body: str | None
    status: str
    is_read: bool
    data: dict[str, Any] | None
    sent_at: datetime | None
    read_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationCreate(BaseModel):
    user_id: UUID
    workspace_id: UUID | None = None
    template_id: UUID | None = None
    type: str
    channel: str = "in_app"
    title: str | None = None
    body: str | None = None
    data: dict[str, Any] | None = None


class NotificationSend(BaseModel):
    user_id: UUID
    workspace_id: UUID | None = None
    template_id: UUID | None = None
    type: str
    channel: str = "in_app"
    title: str | None = None
    body: str | None = None
    data: dict[str, Any] | None = None


class NotificationMarkRead(BaseModel):
    is_read: bool = True
