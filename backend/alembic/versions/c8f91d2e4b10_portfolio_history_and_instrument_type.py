"""portfolio history portfolio_id backfill and etf_holdings instrument_type

Revision ID: c8f91d2e4b10
Revises: a1c2e3f4b5d6
Create Date: 2026-05-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "c8f91d2e4b10"
down_revision = "a1c2e3f4b5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "portfolio_value_history",
        sa.Column("portfolio_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "daily_portfolio_summary",
        sa.Column("portfolio_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "monthly_portfolio_summary",
        sa.Column("portfolio_id", sa.Integer(), nullable=True),
    )

    # Prefer default TFSA portfolio per user
    op.execute(
        """
        UPDATE portfolio_value_history pvh
        SET portfolio_id = ip.id
        FROM investment_portfolios ip
        WHERE ip.user_id = pvh.user_id AND ip.is_default_tfsa IS TRUE
        """
    )
    op.execute(
        """
        UPDATE daily_portfolio_summary dps
        SET portfolio_id = ip.id
        FROM investment_portfolios ip
        WHERE ip.user_id = dps.user_id AND ip.is_default_tfsa IS TRUE
        """
    )
    op.execute(
        """
        UPDATE monthly_portfolio_summary mps
        SET portfolio_id = ip.id
        FROM investment_portfolios ip
        WHERE ip.user_id = mps.user_id AND ip.is_default_tfsa IS TRUE
        """
    )

    # Fallback: any portfolio for that user (prefers is_default_tfsa then lowest id)
    op.execute(
        """
        UPDATE portfolio_value_history pvh
        SET portfolio_id = sub.ip_id
        FROM (
            SELECT DISTINCT ON (user_id) user_id AS uid, id AS ip_id
            FROM investment_portfolios
            ORDER BY user_id, is_default_tfsa DESC, id ASC
        ) sub
        WHERE pvh.user_id = sub.uid AND pvh.portfolio_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE daily_portfolio_summary dps
        SET portfolio_id = sub.ip_id
        FROM (
            SELECT DISTINCT ON (user_id) user_id AS uid, id AS ip_id
            FROM investment_portfolios
            ORDER BY user_id, is_default_tfsa DESC, id ASC
        ) sub
        WHERE dps.user_id = sub.uid AND dps.portfolio_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE monthly_portfolio_summary mps
        SET portfolio_id = sub.ip_id
        FROM (
            SELECT DISTINCT ON (user_id) user_id AS uid, id AS ip_id
            FROM investment_portfolios
            ORDER BY user_id, is_default_tfsa DESC, id ASC
        ) sub
        WHERE mps.user_id = sub.uid AND mps.portfolio_id IS NULL
        """
    )

    # Users with history rows but no investment_portfolios row (legacy edge case)
    op.execute(
        """
        INSERT INTO investment_portfolios (user_id, name, slug, is_default_tfsa, is_active, currency_code)
        SELECT DISTINCT u.id, 'TFSA', 'tfsa', TRUE, TRUE, 'ZAR'
        FROM users u
        WHERE EXISTS (
            SELECT 1 FROM portfolio_value_history pvh
            WHERE pvh.user_id = u.id AND pvh.portfolio_id IS NULL
        )
        AND NOT EXISTS (
            SELECT 1 FROM investment_portfolios ip WHERE ip.user_id = u.id
        )
        """
    )
    op.execute(
        """
        INSERT INTO investment_portfolios (user_id, name, slug, is_default_tfsa, is_active, currency_code)
        SELECT DISTINCT u.id, 'TFSA', 'tfsa', TRUE, TRUE, 'ZAR'
        FROM users u
        WHERE EXISTS (
            SELECT 1 FROM daily_portfolio_summary dps
            WHERE dps.user_id = u.id AND dps.portfolio_id IS NULL
        )
        AND NOT EXISTS (
            SELECT 1 FROM investment_portfolios ip WHERE ip.user_id = u.id
        )
        """
    )
    op.execute(
        """
        INSERT INTO investment_portfolios (user_id, name, slug, is_default_tfsa, is_active, currency_code)
        SELECT DISTINCT u.id, 'TFSA', 'tfsa', TRUE, TRUE, 'ZAR'
        FROM users u
        WHERE EXISTS (
            SELECT 1 FROM monthly_portfolio_summary mps
            WHERE mps.user_id = u.id AND mps.portfolio_id IS NULL
        )
        AND NOT EXISTS (
            SELECT 1 FROM investment_portfolios ip WHERE ip.user_id = u.id
        )
        """
    )

    op.execute(
        """
        UPDATE portfolio_value_history pvh
        SET portfolio_id = ip.id
        FROM investment_portfolios ip
        WHERE ip.user_id = pvh.user_id AND ip.is_default_tfsa IS TRUE AND pvh.portfolio_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE daily_portfolio_summary dps
        SET portfolio_id = ip.id
        FROM investment_portfolios ip
        WHERE ip.user_id = dps.user_id AND ip.is_default_tfsa IS TRUE AND dps.portfolio_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE monthly_portfolio_summary mps
        SET portfolio_id = ip.id
        FROM investment_portfolios ip
        WHERE ip.user_id = mps.user_id AND ip.is_default_tfsa IS TRUE AND mps.portfolio_id IS NULL
        """
    )

    op.execute(
        """
        UPDATE portfolio_value_history pvh
        SET portfolio_id = sub.ip_id
        FROM (
            SELECT DISTINCT ON (user_id) user_id AS uid, id AS ip_id
            FROM investment_portfolios
            ORDER BY user_id, is_default_tfsa DESC, id ASC
        ) sub
        WHERE pvh.user_id = sub.uid AND pvh.portfolio_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE daily_portfolio_summary dps
        SET portfolio_id = sub.ip_id
        FROM (
            SELECT DISTINCT ON (user_id) user_id AS uid, id AS ip_id
            FROM investment_portfolios
            ORDER BY user_id, is_default_tfsa DESC, id ASC
        ) sub
        WHERE dps.user_id = sub.uid AND dps.portfolio_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE monthly_portfolio_summary mps
        SET portfolio_id = sub.ip_id
        FROM (
            SELECT DISTINCT ON (user_id) user_id AS uid, id AS ip_id
            FROM investment_portfolios
            ORDER BY user_id, is_default_tfsa DESC, id ASC
        ) sub
        WHERE mps.user_id = sub.uid AND mps.portfolio_id IS NULL
        """
    )

    conn = op.get_bind()
    for label, stmt in [
        ("portfolio_value_history", "SELECT COUNT(*) FROM portfolio_value_history WHERE portfolio_id IS NULL"),
        ("daily_portfolio_summary", "SELECT COUNT(*) FROM daily_portfolio_summary WHERE portfolio_id IS NULL"),
        ("monthly_portfolio_summary", "SELECT COUNT(*) FROM monthly_portfolio_summary WHERE portfolio_id IS NULL"),
    ]:
        n = conn.execute(text(stmt)).scalar()
        if n:
            raise RuntimeError(f"c8f91d2e4b10: {label} still has {n} rows with NULL portfolio_id after backfill")

    op.create_foreign_key(
        "fk_portfolio_value_history_portfolio_id",
        "portfolio_value_history",
        "investment_portfolios",
        ["portfolio_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_daily_portfolio_summary_portfolio_id",
        "daily_portfolio_summary",
        "investment_portfolios",
        ["portfolio_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_monthly_portfolio_summary_portfolio_id",
        "monthly_portfolio_summary",
        "investment_portfolios",
        ["portfolio_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.alter_column("portfolio_value_history", "portfolio_id", nullable=False)
    op.alter_column("daily_portfolio_summary", "portfolio_id", nullable=False)
    op.alter_column("monthly_portfolio_summary", "portfolio_id", nullable=False)

    op.create_index(
        "ix_portfolio_value_history_user_portfolio_recorded",
        "portfolio_value_history",
        ["user_id", "portfolio_id", "recorded_at"],
        unique=False,
    )
    op.create_index(
        "ix_daily_portfolio_summary_user_portfolio_date",
        "daily_portfolio_summary",
        ["user_id", "portfolio_id", "date"],
        unique=False,
    )
    op.create_index(
        "ix_monthly_portfolio_summary_user_portfolio_ym",
        "monthly_portfolio_summary",
        ["user_id", "portfolio_id", "year", "month"],
        unique=False,
    )

    op.create_unique_constraint(
        "uq_daily_portfolio_summary_user_portfolio_date",
        "daily_portfolio_summary",
        ["user_id", "portfolio_id", "date"],
    )
    op.create_unique_constraint(
        "uq_monthly_portfolio_summary_user_portfolio_ym",
        "monthly_portfolio_summary",
        ["user_id", "portfolio_id", "year", "month"],
    )

    op.add_column(
        "etf_holdings",
        sa.Column(
            "instrument_type",
            sa.String(),
            nullable=False,
            server_default="etf",
        ),
    )


def downgrade() -> None:
    op.drop_column("etf_holdings", "instrument_type")

    op.drop_constraint(
        "uq_monthly_portfolio_summary_user_portfolio_ym",
        "monthly_portfolio_summary",
        type_="unique",
    )
    op.drop_constraint(
        "uq_daily_portfolio_summary_user_portfolio_date",
        "daily_portfolio_summary",
        type_="unique",
    )

    op.drop_index("ix_monthly_portfolio_summary_user_portfolio_ym", table_name="monthly_portfolio_summary")
    op.drop_index("ix_daily_portfolio_summary_user_portfolio_date", table_name="daily_portfolio_summary")
    op.drop_index("ix_portfolio_value_history_user_portfolio_recorded", table_name="portfolio_value_history")

    op.drop_constraint("fk_monthly_portfolio_summary_portfolio_id", "monthly_portfolio_summary", type_="foreignkey")
    op.drop_constraint("fk_daily_portfolio_summary_portfolio_id", "daily_portfolio_summary", type_="foreignkey")
    op.drop_constraint("fk_portfolio_value_history_portfolio_id", "portfolio_value_history", type_="foreignkey")

    op.drop_column("monthly_portfolio_summary", "portfolio_id")
    op.drop_column("daily_portfolio_summary", "portfolio_id")
    op.drop_column("portfolio_value_history", "portfolio_id")
