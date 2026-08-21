from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


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


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=200)


class MembershipRead(BaseModel):
    id: UUID
    user_id: UUID
    workspace_id: UUID
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class MembershipCreate(BaseModel):
    email: EmailStr
    role: str = Field(default="viewer", pattern="^(owner|editor|viewer)$")


class MembershipUpdate(BaseModel):
    role: str = Field(..., pattern="^(owner|editor|viewer)$")


class WorkspaceInviteRead(BaseModel):
    id: UUID
    workspace_id: UUID
    email: EmailStr
    role: str
    status: str
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class WorkspaceInviteAccept(BaseModel):
    token: str


class MeRead(BaseModel):
    """The authenticated user plus their admin flag and Pro entitlement."""

    id: UUID
    clerk_id: str
    email: str
    name: str | None = None
    avatar_url: str | None = None
    created_at: datetime
    is_admin: bool = False
    plan: str = "free"
    pro_expires_at: datetime | None = None


class ProGrantRead(BaseModel):
    id: UUID
    clerk_id: str
    granted_by: str
    reason: str | None = None
    starts_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    revoked_by: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserRead(BaseModel):
    """A Clerk user merged with locally stored entitlement state."""

    clerk_id: str
    email: str | None = None
    name: str | None = None
    avatar_url: str | None = None
    created_at: datetime | None = None
    last_sign_in_at: datetime | None = None
    is_admin: bool = False
    plan: str = "free"
    pro_expires_at: datetime | None = None


class GrantProRequest(BaseModel):
    days: int = Field(..., ge=1, le=3650, description="Length of Pro access in days")
    reason: str | None = Field(default=None, max_length=500)


class GrantProResponse(BaseModel):
    clerk_id: str
    plan: str
    pro_expires_at: datetime
    grant: ProGrantRead


class RevokeProResponse(BaseModel):
    clerk_id: str
    plan: str
    revoked: int


class ClerkWebhookPayload(BaseModel):
    data: dict[str, Any]
    type: str
    object: str = "event"
