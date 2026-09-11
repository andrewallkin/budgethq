"""drop_cadence_from_budget_category

Revision ID: e1b3c5d7f9a0
Revises: d0a2b4c6e8f0
Create Date: 2026-09-10 16:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "e1b3c5d7f9a0"
down_revision = "d0a2b4c6e8f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("budget_categories", "cadence")


def downgrade() -> None:
    op.add_column(
        "budget_categories",
        sa.Column("cadence", sa.String(), nullable=True, server_default="monthly"),
    )
    op.execute("UPDATE budget_categories SET cadence = 'monthly' WHERE cadence IS NULL")
    op.alter_column("budget_categories", "cadence", nullable=False)
