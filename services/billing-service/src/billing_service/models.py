import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = {"schema": "billing"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    stripe_customer_id = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True, unique=True, index=True)
    status = Column(String, nullable=True, default="free")
    plan = Column(String, nullable=False, default="free")
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class UsageRecord(Base):
    __tablename__ = "usage_records"
    __table_args__ = {"schema": "billing"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id = Column(
        UUID(as_uuid=True), ForeignKey("billing.subscriptions.id"), nullable=True
    )
    workspace_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    metric = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    recorded_at = Column(DateTime(timezone=True), default=utc_now)
