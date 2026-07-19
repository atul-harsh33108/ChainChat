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
    op.execute("CREATE SCHEMA IF NOT EXISTS billing")

    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stripe_customer_id", sa.String(), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(), unique=True, nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("plan", sa.String(), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="billing",
    )

    op.create_index(
        "ix_subscriptions_workspace_id",
        "subscriptions",
        ["workspace_id"],
        schema="billing",
    )
    op.create_index(
        "ix_subscriptions_stripe_subscription_id",
        "subscriptions",
        ["stripe_subscription_id"],
        schema="billing",
    )

    op.create_table(
        "usage_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "subscription_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("billing.subscriptions.id"),
            nullable=True,
        ),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metric", sa.String(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        schema="billing",
    )

    op.create_index(
        "ix_usage_records_workspace_id",
        "usage_records",
        ["workspace_id"],
        schema="billing",
    )


def downgrade() -> None:
    op.drop_index("ix_usage_records_workspace_id", schema="billing")
    op.drop_table("usage_records", schema="billing")
    op.drop_index("ix_subscriptions_stripe_subscription_id", schema="billing")
    op.drop_index("ix_subscriptions_workspace_id", schema="billing")
    op.drop_table("subscriptions", schema="billing")
