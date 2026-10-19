"""add read-only external api key, bank tx hidden flag, categorization rule transaction_type

Revision ID: c5e1f2a3d4b6
Revises: a4c6e8f0b2d1
Create Date: 2026-10-19

"""
import sqlalchemy as sa
from alembic import op

revision = "c5e1f2a3d4b6"
down_revision = "a4c6e8f0b2d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("external_api_key_ro_prefix", sa.String(12), nullable=True))
    op.create_index(
        "ix_users_external_api_key_ro_prefix", "users", ["external_api_key_ro_prefix"], unique=False
    )
    op.add_column("users", sa.Column("external_api_key_ro_hash", sa.String(), nullable=True))
    op.add_column("users", sa.Column("external_api_key_ro_created_at", sa.DateTime(), nullable=True))
    op.add_column(
        "bank_transactions",
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "categorization_rules", sa.Column("transaction_type", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("categorization_rules", "transaction_type")
    op.drop_column("bank_transactions", "hidden")
    op.drop_column("users", "external_api_key_ro_created_at")
    op.drop_column("users", "external_api_key_ro_hash")
    op.drop_index("ix_users_external_api_key_ro_prefix", table_name="users")
    op.drop_column("users", "external_api_key_ro_prefix")
