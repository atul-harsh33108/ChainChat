from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from src.workflow_service.ids import to_uuid

# The ORM attribute is ``meta_data`` because SQLAlchemy reserves ``metadata`` on
# the declarative base. The public JSON name stays ``metadata``:
#   - inbound  : validation_alias accepts "metadata" (or "meta_data")
#   - outbound : serialization_alias emits "metadata"
# Read models must NOT set a validation alias of "metadata", otherwise Pydantic's
# from_attributes lookup would read SQLAlchemy's MetaData registry off the model.
_IN_META = Field(
    default=None,
    validation_alias=AliasChoices("metadata", "meta_data"),
    serialization_alias="metadata",
)
_OUT_META = Field(default=None, serialization_alias="metadata")


class WorkflowNodeBase(BaseModel):
    node_type: str
    label: str | None = None
    position_x: int | None = None
    position_y: int | None = None
    config: dict[str, Any] | None = None


class WorkflowNodeRead(WorkflowNodeBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    version_id: UUID
    created_at: datetime


class WorkflowEdgeBase(BaseModel):
    source_node_id: UUID
    target_node_id: UUID
    label: str | None = None
    condition: dict[str, Any] | None = None


class WorkflowEdgeRead(WorkflowEdgeBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    version_id: UUID
    created_at: datetime


class WorkflowVersionCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version_number: int | None = None
    name: str | None = None
    description: str | None = None
    change_summary: str | None = None
    status: str = "draft"
    graph: dict[str, Any] | None = None
    meta_data: dict[str, Any] | None = _IN_META


class WorkflowVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    workflow_id: UUID
    version_number: int
    name: str | None = None
    description: str | None = None
    change_summary: str | None = None
    status: str
    graph: dict[str, Any] | None = None
    meta_data: dict[str, Any] | None = _OUT_META
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    nodes: list[WorkflowNodeRead] = []
    edges: list[WorkflowEdgeRead] = []


class WorkflowCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    workspace_id: UUID
    name: str
    description: str | None = None
    meta_data: dict[str, Any] | None = _IN_META

    @field_validator("workspace_id", mode="before")
    @classmethod
    def _coerce_workspace_id(cls, value: Any) -> Any:
        # Accept external (Clerk) workspace identifiers, not just UUIDs.
        return to_uuid(value) if value is not None else value


class WorkflowUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = None
    description: str | None = None
    meta_data: dict[str, Any] | None = _IN_META
    published_version_id: UUID | None = None


class WorkflowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    workspace_id: UUID
    owner_id: UUID
    name: str
    description: str | None = None
    meta_data: dict[str, Any] | None = _OUT_META
    is_template: bool
    parent_id: UUID | None = None
    root_version_id: UUID | None = None
    published_version_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    versions: list[WorkflowVersionRead] = []


class WorkflowForkRequest(BaseModel):
    target_workspace_id: UUID
    new_name: str | None = None

    @field_validator("target_workspace_id", mode="before")
    @classmethod
    def _coerce_workspace_id(cls, value: Any) -> Any:
        # Accept external (Clerk) workspace identifiers, not just UUIDs.
        return to_uuid(value) if value is not None else value


class WorkflowForkResponse(BaseModel):
    id: UUID
    name: str
    parent_id: UUID


class CommentCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: str
    version_id: UUID | None = None
    meta_data: dict[str, Any] | None = _IN_META


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    workflow_id: UUID
    version_id: UUID | None = None
    author_id: UUID
    content: str
    meta_data: dict[str, Any] | None = _OUT_META
    created_at: datetime
    updated_at: datetime


class TemplateCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: str | None = None
    category: str | None = None
    tags: list[str] = []
    graph: dict[str, Any] | None = None
    meta_data: dict[str, Any] | None = _IN_META
    is_public: bool = True
    source_workflow_id: UUID | None = None


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    source_workflow_id: UUID | None = None
    name: str
    description: str | None = None
    category: str | None = None
    tags: list[str] | None = []
    graph: dict[str, Any] | None = None
    meta_data: dict[str, Any] | None = _OUT_META
    is_public: bool
    created_by: UUID
    created_at: datetime
    updated_at: datetime


class TemplateApplyRequest(BaseModel):
    workspace_id: UUID
    owner_id: UUID
    name: str | None = None

    @field_validator("workspace_id", "owner_id", mode="before")
    @classmethod
    def _coerce_ids(cls, value: Any) -> Any:
        # Accept external (Clerk) identifiers, not just UUIDs.
        return to_uuid(value) if value is not None else value


class TemplateApplyResponse(BaseModel):
    workflow_id: UUID
    version_id: UUID
    name: str
