"""add investment portfolio currency_code

Revision ID: a1c2e3f4b5d6
Revises: 9f3c2b1a7d11
Create Date: 2026-05-11

"""
from alembic import op
import sqlalchemy as sa


revision = "a1c2e3f4b5d6"
down_revision = "9f3c2b1a7d11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "investment_portfolios",
        sa.Column(
            "currency_code",
            sa.String(),
            nullable=False,
            server_default="ZAR",
        ),
    )


def downgrade() -> None:
    op.drop_column("investment_portfolios", "currency_code")
