from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from src.execution_service.ids import to_uuid


class ExecutionStepCreate(BaseModel):
    step_key: str
    depends_on: list[str] = Field(default_factory=list)
    provider: str
    model_key: str
    prompt: str | None = None
    inputs: dict[str, Any] | None = None


class ExecutionCreate(BaseModel):
    workspace_id: UUID
    chain_id: UUID
    input_payload: dict[str, Any] | None = None
    steps: list[ExecutionStepCreate]

    @field_validator("workspace_id", "chain_id", mode="before")
    @classmethod
    def _coerce_ids(cls, value: Any) -> Any:
        # Accept external (Clerk) identifiers, not just UUIDs.
        return to_uuid(value) if value is not None else value


class ExecutionStepRead(BaseModel):
    id: UUID
    execution_id: UUID
    step_key: str
    depends_on: list[str]
    provider: str
    model_key: str
    prompt: str | None
    inputs: dict[str, Any] | None
    outputs: dict[str, Any] | None
    status: str
    retry_count: int
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class ExecutionRead(BaseModel):
    id: UUID
    workspace_id: UUID
    chain_id: UUID
    status: str
    input_payload: dict[str, Any] | None
    output_payload: dict[str, Any] | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    steps: list[ExecutionStepRead]

    class Config:
        from_attributes = True


class ExecutionStatusUpdate(BaseModel):
    status: str
