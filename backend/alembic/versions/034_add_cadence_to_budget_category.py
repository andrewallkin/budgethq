"""add_cadence_to_budget_category

Revision ID: a7f3c1e9d2b8
Revises: d7e8f9a1b2c4
Create Date: 2026-06-14 13:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7f3c1e9d2b8'
down_revision = 'd7e8f9a1b2c4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add as nullable first so existing rows don't violate NOT NULL, then backfill
    # and enforce NOT NULL. server_default keeps future inserts defaulting to 'monthly'.
    op.add_column(
        'budget_categories',
        sa.Column('cadence', sa.String(), nullable=True, server_default='monthly'),
    )
    op.execute("UPDATE budget_categories SET cadence = 'monthly' WHERE cadence IS NULL")
    op.alter_column('budget_categories', 'cadence', nullable=False)


def downgrade() -> None:
    op.drop_column('budget_categories', 'cadence')
