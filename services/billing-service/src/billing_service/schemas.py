from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


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


class CheckoutResponse(BaseModel):
    session_id: str
    url: str


class PortalCreate(BaseModel):
    workspace_id: UUID
    return_url: str = "http://localhost:5173/billing"


class PortalResponse(BaseModel):
    url: str


class StripeWebhookPayload(BaseModel):
    id: str | None = None
    object: str = "event"
    type: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
