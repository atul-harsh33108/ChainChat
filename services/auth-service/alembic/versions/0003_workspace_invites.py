"""workspace invites for team collaboration

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspace_invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "workspace_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("auth.workspaces.id"),
            nullable=False,
        ),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="viewer"),
        sa.Column("token", sa.String(), unique=True, nullable=False),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="auth",
    )
    op.create_index(
        "ix_workspace_invites_workspace_id", "workspace_invites", ["workspace_id"], schema="auth"
    )
    op.create_index(
        "ix_workspace_invites_email", "workspace_invites", ["email"], schema="auth"
    )
    op.create_index(
        "ix_workspace_invites_token", "workspace_invites", ["token"], schema="auth"
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_invites_token", table_name="workspace_invites", schema="auth")
    op.drop_index("ix_workspace_invites_email", table_name="workspace_invites", schema="auth")
    op.drop_index(
        "ix_workspace_invites_workspace_id", table_name="workspace_invites", schema="auth"
    )
    op.drop_table("workspace_invites", schema="auth")