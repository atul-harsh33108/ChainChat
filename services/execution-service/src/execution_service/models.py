import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String, Text, DateTime, JSON, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def utc_now():
    return datetime.now(timezone.utc)


class Execution(Base):
    __tablename__ = "executions"
    __table_args__ = {"schema": "execution"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    chain_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending", index=True)
    input_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    steps: Mapped[list["ExecutionStep"]] = relationship(
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

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("execution.executions.id"), nullable=False, index=True)
    step_key: Mapped[str] = mapped_column(String, nullable=False)
    depends_on: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    model_key: Mapped[str] = mapped_column(String, nullable=False)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    inputs: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    outputs: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending", index=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    execution: Mapped["Execution"] = relationship("Execution", back_populates="steps")