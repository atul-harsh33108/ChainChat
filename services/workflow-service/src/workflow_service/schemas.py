from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class WorkflowNodeBase(BaseModel):
    node_type: str
    label: str | None = None
    position_x: int | None = None
    position_y: int | None = None
    config: dict[str, Any] | None = None


class WorkflowNodeRead(WorkflowNodeBase):
    id: UUID
    version_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class WorkflowEdgeBase(BaseModel):
    source_node_id: UUID
    target_node_id: UUID
    label: str | None = None
    condition: dict[str, Any] | None = None


class WorkflowEdgeRead(WorkflowEdgeBase):
    id: UUID
    version_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class WorkflowVersionBase(BaseModel):
    version_number: int
    name: str | None = None
    description: str | None = None
    change_summary: str | None = None
    status: str = "draft"
    graph: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class WorkflowVersionCreate(WorkflowVersionBase):
    pass


class WorkflowVersionRead(WorkflowVersionBase):
    id: UUID
    workflow_id: UUID
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    nodes: list[WorkflowNodeRead] = []
    edges: list[WorkflowEdgeRead] = []

    class Config:
        from_attributes = True


class WorkflowBase(BaseModel):
    name: str
    description: str | None = None
    metadata: dict[str, Any] | None = None


class WorkflowCreate(WorkflowBase):
    workspace_id: UUID


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    metadata: dict[str, Any] | None = None
    published_version_id: UUID | None = None


class WorkflowRead(WorkflowBase):
    id: UUID
    workspace_id: UUID
    owner_id: UUID
    is_template: bool
    parent_id: UUID | None = None
    root_version_id: UUID | None = None
    published_version_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    versions: list[WorkflowVersionRead] = []

    class Config:
        from_attributes = True


class WorkflowForkRequest(BaseModel):
    target_workspace_id: UUID
    new_name: str | None = None


class WorkflowForkResponse(BaseModel):
    id: UUID
    name: str
    parent_id: UUID


class CommentBase(BaseModel):
    content: str
    version_id: UUID | None = None
    metadata: dict[str, Any] | None = None


class CommentCreate(CommentBase):
    pass


class CommentRead(CommentBase):
    id: UUID
    workflow_id: UUID
    author_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TemplateBase(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None
    tags: list[str] = []
    graph: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    is_public: bool = True


class TemplateCreate(TemplateBase):
    source_workflow_id: UUID | None = None


class TemplateRead(TemplateBase):
    id: UUID
    source_workflow_id: UUID | None = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TemplateApplyRequest(BaseModel):
    workspace_id: UUID
    owner_id: UUID
    name: str | None = None


class TemplateApplyResponse(BaseModel):
    workflow_id: UUID
    version_id: UUID
    name: str
