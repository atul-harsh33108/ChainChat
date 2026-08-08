"""execution step type + output format

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "execution_steps",
        sa.Column("step_type", sa.String(), nullable=False, server_default="prompt"),
        schema="execution",
    )
    op.add_column(
        "execution_steps",
        sa.Column("format", sa.String(), nullable=True),
        schema="execution",
    )


def downgrade() -> None:
    op.drop_column("execution_steps", "format", schema="execution")
    op.drop_column("execution_steps", "step_type", schema="execution")
