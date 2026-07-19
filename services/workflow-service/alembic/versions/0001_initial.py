"""initial

Revision ID: 0001
Revises:
Create Date: 2026-07-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS workflow")

    op.create_table(
        "workflows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_template", sa.Boolean(), default=False, nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("root_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="workflow",
    )
    op.create_index("ix_workflows_workspace_id", "workflows", ["workspace_id"], schema="workflow")
    op.create_index("ix_workflows_owner_id", "workflows", ["owner_id"], schema="workflow")
    op.create_index("ix_workflows_is_template", "workflows", ["is_template"], schema="workflow")

    op.create_table(
        "workflow_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), default="draft", nullable=False),
        sa.Column("graph", postgresql.JSONB(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="workflow",
    )
    op.create_index("ix_workflow_versions_workflow_id", "workflow_versions", ["workflow_id"], schema="workflow")

    op.create_table(
        "workflow_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("node_type", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("position_x", sa.Integer(), nullable=True),
        sa.Column("position_y", sa.Integer(), nullable=True),
        sa.Column("config", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="workflow",
    )
    op.create_index("ix_workflow_nodes_version_id", "workflow_nodes", ["version_id"], schema="workflow")

    op.create_table(
        "workflow_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_node_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_node_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("condition", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="workflow",
    )
    op.create_index("ix_workflow_edges_version_id", "workflow_edges", ["version_id"], schema="workflow")
    op.create_index("ix_workflow_edges_source_node_id", "workflow_edges", ["source_node_id"], schema="workflow")
    op.create_index("ix_workflow_edges_target_node_id", "workflow_edges", ["target_node_id"], schema="workflow")

    op.create_table(
        "comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workflow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="workflow",
    )
    op.create_index("ix_comments_workflow_id", "comments", ["workflow_id"], schema="workflow")

    op.create_table(
        "templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_workflow_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("tags", postgresql.JSONB(), nullable=True),
        sa.Column("graph", postgresql.JSONB(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("is_public", sa.Boolean(), default=True, nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="workflow",
    )
    op.create_index("ix_templates_category", "templates", ["category"], schema="workflow")


def downgrade() -> None:
    op.drop_table("templates", schema="workflow")
    op.drop_table("comments", schema="workflow")
    op.drop_table("workflow_edges", schema="workflow")
    op.drop_table("workflow_nodes", schema="workflow")
    op.drop_table("workflow_versions", schema="workflow")
    op.drop_table("workflows", schema="workflow")
    op.execute("DROP SCHEMA IF EXISTS workflow")
