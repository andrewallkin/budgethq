"""add show_ra_under_investments to users

Revision ID: d7e8f9a1b2c4
Revises: b2c9e1f4a8d3
Create Date: 2026-05-13

"""
from alembic import op
import sqlalchemy as sa


revision = "d7e8f9a1b2c4"
down_revision = "b2c9e1f4a8d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "show_ra_under_investments",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("false"),
        ),
    )
    op.execute(
        """
        UPDATE users
        SET show_ra_under_investments = true
        WHERE id IN (
            SELECT user_id FROM ra_value_history
            UNION
            SELECT user_id FROM ra_contributions
            UNION
            SELECT user_id FROM retirement_annuities
        )
        """
    )


def downgrade() -> None:
    op.drop_column("users", "show_ra_under_investments")
