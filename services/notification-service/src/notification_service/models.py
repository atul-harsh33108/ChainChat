import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class NotificationTemplate(Base):
    __tablename__ = "notification_templates"
    __table_args__ = {"schema": "notification"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, nullable=False)
    type = Column(String, nullable=False)
    channel = Column(String, nullable=False, default="email")
    subject = Column(String, nullable=True)
    body_html = Column(Text, nullable=True)
    body_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    notifications = relationship("Notification", back_populates="template")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = {"schema": "notification"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    workspace_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    template_id = Column(UUID(as_uuid=True), ForeignKey("notification.notification_templates.id"), nullable=True)
    type = Column(String, nullable=False)
    channel = Column(String, nullable=False, default="in_app")
    title = Column(String, nullable=True)
    body = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")
    is_read = Column(Boolean, nullable=False, default=False)
    data = Column(JSON, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    template = relationship("NotificationTemplate", back_populates="notifications")
