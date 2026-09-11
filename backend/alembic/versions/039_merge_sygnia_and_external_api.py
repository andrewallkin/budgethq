"""merge sygnia investments chain with external api key

Revision ID: f3c5a7e9b1d2
Revises: c4f8a2e1b9d3, e1b3c5d7f9a0
Create Date: 2026-09-11

Both parents already exist on origin/main (API key) and this branch
(Sygnia 036-038). Empty merge so production at c4f8a2e1b9d3 still applies
the Sygnia revisions, and DBs that already ran both sides only stamp head.
"""
from alembic import op  # noqa: F401


revision = "f3c5a7e9b1d2"
down_revision = ("c4f8a2e1b9d3", "e1b3c5d7f9a0")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
