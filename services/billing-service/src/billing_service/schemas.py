from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from src.billing_service.ids import to_uuid


class SubscriptionRead(BaseModel):
    id: UUID
    workspace_id: UUID
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    status: str | None
    plan: str
    current_period_start: datetime | None
    current_period_end: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UsageRecordRead(BaseModel):
    id: UUID
    subscription_id: UUID | None
    workspace_id: UUID | None
    metric: str
    quantity: int
    recorded_at: datetime

    class Config:
        from_attributes = True


class CheckoutCreate(BaseModel):
    workspace_id: UUID
    success_url: str = "http://localhost:5173/billing/success"
    cancel_url: str = "http://localhost:5173/billing/cancel"

    @field_validator("workspace_id", mode="before")
    @classmethod
    def _coerce_workspace_id(cls, value):
        # Accept external (Clerk) workspace identifiers, not just UUIDs.
        return to_uuid(value) if value is not None else value


class CheckoutResponse(BaseModel):
    session_id: str
    url: str


class PortalCreate(BaseModel):
    workspace_id: UUID
    return_url: str = "http://localhost:5173/billing"

    @field_validator("workspace_id", mode="before")
    @classmethod
    def _coerce_workspace_id(cls, value):
        # Accept external (Clerk) workspace identifiers, not just UUIDs.
        return to_uuid(value) if value is not None else value


class PortalResponse(BaseModel):
    url: str


class StripeWebhookPayload(BaseModel):
    id: str | None = None
    object: str = "event"
    type: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
