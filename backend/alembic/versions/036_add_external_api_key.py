"""add external api key fields to users

Revision ID: c4f8a2e1b9d3
Revises: b8e4d2f0a3c5
Create Date: 2026-09-02

"""
from alembic import op
import sqlalchemy as sa


revision = "c4f8a2e1b9d3"
down_revision = "b8e4d2f0a3c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("external_api_key_prefix", sa.String(length=12), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("external_api_key_hash", sa.String(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("external_api_key_created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_users_external_api_key_prefix",
        "users",
        ["external_api_key_prefix"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_users_external_api_key_prefix", table_name="users")
    op.drop_column("users", "external_api_key_created_at")
    op.drop_column("users", "external_api_key_hash")
    op.drop_column("users", "external_api_key_prefix")
