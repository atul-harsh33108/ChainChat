import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, Integer, String, Text, DateTime, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class Execution(Base):
    __tablename__ = "executions"
    __table_args__ = {"schema": "execution"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    chain_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    status = Column(String, nullable=False, default="pending", index=True)
    input_payload = Column(JSON, nullable=True)
    output_payload = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    steps = relationship(
        "ExecutionStep",
        back_populates="execution",
        cascade="all, delete-orphan",
        order_by="ExecutionStep.created_at",
        # Eager-load: responses serialize `steps`, and lazy loading inside async
        # request handlers raises MissingGreenlet.
        lazy="selectin",
    )


class ExecutionStep(Base):
    __tablename__ = "execution_steps"
    __table_args__ = (
        UniqueConstraint("execution_id", "step_key", name="uq_execution_steps_execution_step"),
        {"schema": "execution"},
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id = Column(UUID(as_uuid=True), ForeignKey("execution.executions.id"), nullable=False, index=True)
    step_key = Column(String, nullable=False)
    depends_on = Column(JSON, nullable=True, default=list)
    provider = Column(String, nullable=False)
    model_key = Column(String, nullable=False)
    prompt = Column(Text, nullable=True)
    inputs = Column(JSON, nullable=True)
    outputs = Column(JSON, nullable=True)
    status = Column(String, nullable=False, default="pending", index=True)
    retry_count = Column(Integer, nullable=False, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    execution = relationship("Execution", back_populates="steps")
