"""per-user telegram bot connection columns on users

Revision ID: 044_user_telegram_connection
Revises: 043_mcp_oauth
Create Date: 2026-11-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "044_user_telegram_connection"
down_revision: str | None = "043_mcp_oauth"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("telegram_bot_token", sa.String(), nullable=True))
    op.add_column("users", sa.Column("telegram_allowed_user_id", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("telegram_webhook_secret", sa.String(length=64), nullable=True))
    op.create_index(
        op.f("ix_users_telegram_webhook_secret"),
        "users",
        ["telegram_webhook_secret"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_users_telegram_webhook_secret"), table_name="users")
    op.drop_column("users", "telegram_webhook_secret")
    op.drop_column("users", "telegram_allowed_user_id")
    op.drop_column("users", "telegram_bot_token")