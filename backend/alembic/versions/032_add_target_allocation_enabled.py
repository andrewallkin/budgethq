"""investment portfolios target_allocation_enabled

Revision ID: b2c9e1f4a8d3
Revises: c8f91d2e4b10
Create Date: 2026-05-11

"""
from alembic import op
import sqlalchemy as sa


revision = "b2c9e1f4a8d3"
down_revision = "c8f91d2e4b10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "investment_portfolios",
        sa.Column(
            "target_allocation_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("investment_portfolios", "target_allocation_enabled")
