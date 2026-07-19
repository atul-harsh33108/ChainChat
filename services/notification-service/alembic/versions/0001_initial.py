"""Initial notification service schema

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
    op.execute("CREATE SCHEMA IF NOT EXISTS notification")

    op.create_table(
        "notification_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("channel", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        schema="notification",
    )

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("channel", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["notification.notification_templates.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="notification",
    )
    op.create_index(
        op.f("ix_notifications_user_id"),
        "notifications",
        ["user_id"],
        unique=False,
        schema="notification",
    )
    op.create_index(
        op.f("ix_notifications_workspace_id"),
        "notifications",
        ["workspace_id"],
        unique=False,
        schema="notification",
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_notifications_workspace_id"),
        table_name="notifications",
        schema="notification",
    )
    op.drop_index(
        op.f("ix_notifications_user_id"),
        table_name="notifications",
        schema="notification",
    )
    op.drop_table("notifications", schema="notification")
    op.drop_table("notification_templates", schema="notification")
    op.execute("DROP SCHEMA IF EXISTS notification CASCADE")
