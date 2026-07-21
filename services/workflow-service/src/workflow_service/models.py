import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class Workflow(Base):
    __tablename__ = "workflows"
    __table_args__ = {"schema": "workflow"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_template = Column(Boolean, default=False, nullable=False, index=True)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("workflow.workflows.id"), nullable=True)
    root_version_id = Column(UUID(as_uuid=True), nullable=True)
    published_version_id = Column(UUID(as_uuid=True), nullable=True)
    meta_data = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    versions = relationship(
        "WorkflowVersion",
        back_populates="workflow",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    comments = relationship(
        "Comment",
        back_populates="workflow",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class WorkflowVersion(Base):
    __tablename__ = "workflow_versions"
    __table_args__ = {"schema": "workflow"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflow.workflows.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    change_summary = Column(Text, nullable=True)
    status = Column(String, default="draft", nullable=False)
    graph = Column(JSONB, nullable=True)
    meta_data = Column("metadata", JSONB, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workflow = relationship("Workflow", back_populates="versions")
    nodes = relationship(
        "WorkflowNode",
        back_populates="version",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    edges = relationship(
        "WorkflowEdge",
        back_populates="version",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class WorkflowNode(Base):
    __tablename__ = "workflow_nodes"
    __table_args__ = {"schema": "workflow"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version_id = Column(UUID(as_uuid=True), ForeignKey("workflow.workflow_versions.id"), nullable=False, index=True)
    node_type = Column(String, nullable=False)
    label = Column(String, nullable=True)
    position_x = Column(Integer, nullable=True)
    position_y = Column(Integer, nullable=True)
    config = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    version = relationship("WorkflowVersion", back_populates="nodes")


class WorkflowEdge(Base):
    __tablename__ = "workflow_edges"
    __table_args__ = {"schema": "workflow"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version_id = Column(UUID(as_uuid=True), ForeignKey("workflow.workflow_versions.id"), nullable=False, index=True)
    source_node_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    target_node_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    label = Column(String, nullable=True)
    condition = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    version = relationship("WorkflowVersion", back_populates="edges")


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = {"schema": "workflow"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflow.workflows.id"), nullable=False, index=True)
    version_id = Column(UUID(as_uuid=True), ForeignKey("workflow.workflow_versions.id"), nullable=True)
    author_id = Column(UUID(as_uuid=True), nullable=False)
    content = Column(Text, nullable=False)
    meta_data = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workflow = relationship("Workflow", back_populates="comments")


class Template(Base):
    __tablename__ = "templates"
    __table_args__ = {"schema": "workflow"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflow.workflows.id"), nullable=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True, index=True)
    tags = Column(JSONB, nullable=True)
    graph = Column(JSONB, nullable=True)
    meta_data = Column("metadata", JSONB, nullable=True)
    is_public = Column(Boolean, default=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
