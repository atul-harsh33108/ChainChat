import uuid
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.billing_service.config import settings
from src.billing_service.ids import to_uuid
from src.billing_service.db import get_db
from src.billing_service.models import Subscription, UsageRecord
from src.billing_service.schemas import (
    CheckoutCreate,
    CheckoutResponse,
    PortalCreate,
    PortalResponse,
    SubscriptionRead,
    UsageRecordRead,
)

router = APIRouter()

if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key


@router.get("/subscription", response_model=SubscriptionRead)
async def get_subscription(request: Request, db: AsyncSession = Depends(get_db)):
    workspace_id_str = request.headers.get("x-workspace-id")
    workspace_id = to_uuid(workspace_id_str) if workspace_id_str else uuid.uuid4()

    result = await db.execute(
        select(Subscription).where(Subscription.workspace_id == workspace_id)
    )
    subscription = result.scalar_one_or_none()
    if subscription:
        return subscription

    if settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found",
        )

    return {
        "id": uuid.uuid4(),
        "workspace_id": workspace_id,
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "status": "free",
        "plan": "free",
        "current_period_start": None,
        "current_period_end": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(payload: CheckoutCreate):
    if settings.stripe_secret_key and settings.stripe_price_id:
        try:
            session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
                mode="subscription",
                success_url=payload.success_url,
                cancel_url=payload.cancel_url,
                client_reference_id=str(payload.workspace_id),
            )
            return {"session_id": session.id, "url": session.url}
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Stripe checkout error: {exc}",
            )

    return {"session_id": "cs_placeholder", "url": payload.success_url}


@router.post("/portal", response_model=PortalResponse)
async def create_portal(payload: PortalCreate):
    if settings.stripe_secret_key:
        try:
            session = stripe.billing_portal.Session.create(
                customer="cus_placeholder",
                return_url=payload.return_url,
            )
            return {"url": session.url}
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Stripe portal error: {exc}",
            )

    return {"url": payload.return_url}


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    if settings.stripe_webhook_secret:
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")
        try:
            stripe.Webhook.construct_event(
                payload, sig_header, settings.stripe_webhook_secret
            )
        except stripe.SignatureVerificationError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid webhook signature",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Webhook processing error: {exc}",
            )

    return {"received": True}


@router.get("/usage", response_model=list[UsageRecordRead])
async def list_usage(request: Request, db: AsyncSession = Depends(get_db)):
    workspace_id_str = request.headers.get("x-workspace-id")
    workspace_id = to_uuid(workspace_id_str) if workspace_id_str else None

    if workspace_id:
        result = await db.execute(
            select(UsageRecord).where(UsageRecord.workspace_id == workspace_id)
        )
        return result.scalars().all()

    return []
