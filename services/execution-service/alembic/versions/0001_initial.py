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
    op.execute("CREATE SCHEMA IF NOT EXISTS execution")

    op.create_table(
        "executions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("chain_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("input_payload", postgresql.JSONB(), nullable=True),
        sa.Column("output_payload", postgresql.JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="execution",
    )
    op.create_index(
        "ix_executions_workspace_id",
        "executions",
        ["workspace_id"],
        schema="execution",
    )
    op.create_index(
        "ix_executions_chain_id",
        "executions",
        ["chain_id"],
        schema="execution",
    )
    op.create_index(
        "ix_executions_status",
        "executions",
        ["status"],
        schema="execution",
    )

    op.create_table(
        "execution_steps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("execution_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("step_key", sa.String(), nullable=False),
        sa.Column("depends_on", postgresql.JSONB(), nullable=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model_key", sa.String(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("inputs", postgresql.JSONB(), nullable=True),
        sa.Column("outputs", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="execution",
    )
    op.create_index(
        "ix_execution_steps_execution_id",
        "execution_steps",
        ["execution_id"],
        schema="execution",
    )
    op.create_index(
        "ix_execution_steps_status",
        "execution_steps",
        ["status"],
        schema="execution",
    )
    op.create_unique_constraint(
        "uq_execution_steps_execution_step",
        "execution_steps",
        ["execution_id", "step_key"],
        schema="execution",
    )
    op.create_foreign_key(
        "fk_execution_steps_execution_id",
        "execution_steps",
        "executions",
        ["execution_id"],
        ["id"],
        source_schema="execution",
        referent_schema="execution",
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_table("execution_steps", schema="execution")
    op.drop_table("executions", schema="execution")
