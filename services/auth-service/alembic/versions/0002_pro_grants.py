"""pro grants for admin-managed time-limited Pro access

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pro_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("auth.users.id"),
            nullable=True,
        ),
        sa.Column("clerk_id", sa.String(), nullable=False),
        sa.Column("granted_by", sa.String(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="auth",
    )
    op.create_index("ix_pro_grants_clerk_id", "pro_grants", ["clerk_id"], schema="auth")
    op.create_index("ix_pro_grants_user_id", "pro_grants", ["user_id"], schema="auth")
    # Speeds up the "is this user currently Pro?" lookup.
    op.create_index(
        "ix_pro_grants_active", "pro_grants", ["clerk_id", "expires_at"], schema="auth"
    )


def downgrade() -> None:
    op.drop_index("ix_pro_grants_active", table_name="pro_grants", schema="auth")
    op.drop_index("ix_pro_grants_user_id", table_name="pro_grants", schema="auth")
    op.drop_index("ix_pro_grants_clerk_id", table_name="pro_grants", schema="auth")
    op.drop_table("pro_grants", schema="auth")
