import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_id = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_org_id = Column(String, unique=True, nullable=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    plan = Column(String, default="free")
    subscription_status = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("auth.users.id"), nullable=False)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("auth.workspaces.id"), nullable=False)
    role = Column(String, nullable=False, default="viewer")
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = {"schema": "auth"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), nullable=True)
    actor_id = Column(UUID(as_uuid=True), nullable=True)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
