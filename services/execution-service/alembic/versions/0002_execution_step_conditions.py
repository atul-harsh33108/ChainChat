"""execution step conditions

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-08 00:00:00.000000

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
    op.add_column(
        "execution_steps",
        sa.Column("conditions", postgresql.JSONB(), nullable=True),
        schema="execution",
    )


def downgrade() -> None:
    op.drop_column("execution_steps", "conditions", schema="execution")
