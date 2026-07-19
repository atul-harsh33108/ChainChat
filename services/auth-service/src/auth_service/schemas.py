from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserRead(BaseModel):
    id: UUID
    clerk_id: str
    email: EmailStr
    name: str | None
    avatar_url: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class WorkspaceRead(BaseModel):
    id: UUID
    name: str
    slug: str
    plan: str
    subscription_status: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class MembershipRead(BaseModel):
    id: UUID
    user_id: UUID
    workspace_id: UUID
    role: str

    class Config:
        from_attributes = True


class ClerkWebhookPayload(BaseModel):
    data: dict[str, Any]
    type: str
    object: str = "event"
