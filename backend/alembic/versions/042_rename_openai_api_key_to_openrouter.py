"""rename users.openai_api_key to openrouter_api_key

Revision ID: b7d1e9c4a2f6
Revises: c5e1f2a3d4b6
Create Date: 2026-11-13

"""
from alembic import op

revision = "b7d1e9c4a2f6"
down_revision = "c5e1f2a3d4b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "openai_api_key", new_column_name="openrouter_api_key")


def downgrade() -> None:
    op.alter_column("users", "openrouter_api_key", new_column_name="openai_api_key")
