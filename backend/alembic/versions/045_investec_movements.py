"""investec movements table for telegram approval flow

Revision ID: 045_investec_movements
Revises: 044_user_telegram_connection
Create Date: 2026-11-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "045_investec_movements"
down_revision: str | None = "044_user_telegram_connection"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "investec_movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("source_account_id", sa.String(), nullable=False),
        sa.Column("investec_body", postgresql.JSONB(), nullable=False),
        sa.Column("display_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(), server_default="pending", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True),
        sa.Column("telegram_message_id", sa.BigInteger(), nullable=True),
        sa.Column("idempotency_key", sa.String(), nullable=True),
        sa.Column("investec_response", postgresql.JSONB(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_investec_movements_id"), "investec_movements", ["id"], unique=False)
    op.create_index(op.f("ix_investec_movements_user_id"), "investec_movements", ["user_id"], unique=False)
    op.create_index(op.f("ix_investec_movements_status"), "investec_movements", ["status"], unique=False)
    op.create_index(
        "uq_investec_movements_user_idempotency",
        "investec_movements",
        ["user_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_investec_movements_user_idempotency", table_name="investec_movements")
    op.drop_index(op.f("ix_investec_movements_status"), table_name="investec_movements")
    op.drop_index(op.f("ix_investec_movements_user_id"), table_name="investec_movements")
    op.drop_index(op.f("ix_investec_movements_id"), table_name="investec_movements")
    op.drop_table("investec_movements")