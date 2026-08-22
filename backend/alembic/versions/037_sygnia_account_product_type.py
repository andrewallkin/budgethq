"""sygnia_account_product_type

Revision ID: d0a2b4c6e8f0
Revises: c9f1a3b2d4e6
Create Date: 2026-08-22 08:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "d0a2b4c6e8f0"
down_revision = "c9f1a3b2d4e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sygnia_accounts",
        sa.Column("product_type", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sygnia_accounts", "product_type")
