"""add investment portfolios

Revision ID: 9f3c2b1a7d11
Revises: 7a44be3ec5a2
Create Date: 2026-05-11 08:58:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9f3c2b1a7d11"
down_revision = "7a44be3ec5a2"
branch_labels = None
depends_on = None


def _slugify(name: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in name).strip("_")


def upgrade() -> None:
    op.create_table(
        "investment_portfolios",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("is_default_tfsa", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "slug", name="uq_investment_portfolio_user_slug"),
    )
    op.create_index(op.f("ix_investment_portfolios_id"), "investment_portfolios", ["id"], unique=False)
    op.create_index(op.f("ix_investment_portfolios_user_id"), "investment_portfolios", ["user_id"], unique=False)

    op.add_column("etf_holdings", sa.Column("portfolio_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_etf_holdings_portfolio_id"), "etf_holdings", ["portfolio_id"], unique=False)
    op.create_foreign_key(
        "fk_etf_holdings_portfolio_id_investment_portfolios",
        "etf_holdings",
        "investment_portfolios",
        ["portfolio_id"],
        ["id"],
    )

    op.add_column("etf_transactions", sa.Column("portfolio_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_etf_transactions_portfolio_id"), "etf_transactions", ["portfolio_id"], unique=False)
    op.create_foreign_key(
        "fk_etf_transactions_portfolio_id_investment_portfolios",
        "etf_transactions",
        "investment_portfolios",
        ["portfolio_id"],
        ["id"],
    )

    op.add_column("user_sheets", sa.Column("portfolio_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_user_sheets_portfolio_id_investment_portfolios",
        "user_sheets",
        "investment_portfolios",
        ["portfolio_id"],
        ["id"],
    )
    op.create_unique_constraint("uq_user_sheets_portfolio_id", "user_sheets", ["portfolio_id"])
    op.create_index(op.f("ix_user_sheets_user_id"), "user_sheets", ["user_id"], unique=False)

    bind = op.get_bind()
    metadata = sa.MetaData()

    users = sa.Table("users", metadata, sa.Column("id", sa.Integer()))
    investment_portfolios = sa.Table(
        "investment_portfolios",
        metadata,
        sa.Column("id", sa.Integer()),
        sa.Column("user_id", sa.Integer()),
        sa.Column("name", sa.String()),
        sa.Column("slug", sa.String()),
        sa.Column("is_default_tfsa", sa.Boolean()),
        sa.Column("is_active", sa.Boolean()),
    )
    etf_holdings = sa.Table(
        "etf_holdings",
        metadata,
        sa.Column("id", sa.Integer()),
        sa.Column("user_id", sa.Integer()),
        sa.Column("portfolio_id", sa.Integer()),
    )
    etf_transactions = sa.Table(
        "etf_transactions",
        metadata,
        sa.Column("id", sa.Integer()),
        sa.Column("user_id", sa.Integer()),
        sa.Column("portfolio_id", sa.Integer()),
    )
    user_sheets = sa.Table(
        "user_sheets",
        metadata,
        sa.Column("id", sa.Integer()),
        sa.Column("user_id", sa.Integer()),
        sa.Column("portfolio_id", sa.Integer()),
        sa.Column("sheet_name", sa.String()),
    )

    user_ids = [row[0] for row in bind.execute(sa.select(users.c.id)).fetchall()]
    for user_id in user_ids:
        existing = bind.execute(
            sa.select(investment_portfolios.c.id).where(
                investment_portfolios.c.user_id == user_id,
                investment_portfolios.c.slug == "tfsa",
            )
        ).first()
        if existing:
            portfolio_id = existing[0]
        else:
            result = bind.execute(
                investment_portfolios.insert()
                .values(
                    user_id=user_id,
                    name="TFSA",
                    slug=_slugify("TFSA"),
                    is_default_tfsa=True,
                    is_active=True,
                )
                .returning(investment_portfolios.c.id)
            )
            portfolio_id = result.scalar_one()

        bind.execute(
            etf_holdings.update()
            .where(
                etf_holdings.c.user_id == user_id,
                etf_holdings.c.portfolio_id.is_(None),
            )
            .values(portfolio_id=portfolio_id)
        )
        bind.execute(
            etf_transactions.update()
            .where(
                etf_transactions.c.user_id == user_id,
                etf_transactions.c.portfolio_id.is_(None),
            )
            .values(portfolio_id=portfolio_id)
        )
        bind.execute(
            user_sheets.update()
            .where(
                user_sheets.c.user_id == user_id,
                user_sheets.c.portfolio_id.is_(None),
            )
            .values(portfolio_id=portfolio_id)
        )

    with op.batch_alter_table("etf_holdings") as batch_op:
        batch_op.alter_column("portfolio_id", existing_type=sa.Integer(), nullable=False)

    with op.batch_alter_table("etf_transactions") as batch_op:
        batch_op.alter_column("portfolio_id", existing_type=sa.Integer(), nullable=False)

    inspector = sa.inspect(bind)
    for constraint in inspector.get_unique_constraints("user_sheets"):
        columns = constraint.get("column_names", [])
        if columns == ["user_id"]:
            op.drop_constraint(constraint["name"], "user_sheets", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("uq_user_sheets_user_id", "user_sheets", ["user_id"])

    op.drop_constraint("uq_user_sheets_portfolio_id", "user_sheets", type_="unique")
    op.drop_constraint("fk_user_sheets_portfolio_id_investment_portfolios", "user_sheets", type_="foreignkey")
    op.drop_column("user_sheets", "portfolio_id")
    op.drop_index(op.f("ix_user_sheets_user_id"), table_name="user_sheets")

    op.drop_constraint(
        "fk_etf_transactions_portfolio_id_investment_portfolios",
        "etf_transactions",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_etf_transactions_portfolio_id"), table_name="etf_transactions")
    op.drop_column("etf_transactions", "portfolio_id")

    op.drop_constraint(
        "fk_etf_holdings_portfolio_id_investment_portfolios",
        "etf_holdings",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_etf_holdings_portfolio_id"), table_name="etf_holdings")
    op.drop_column("etf_holdings", "portfolio_id")

    op.drop_index(op.f("ix_investment_portfolios_user_id"), table_name="investment_portfolios")
    op.drop_index(op.f("ix_investment_portfolios_id"), table_name="investment_portfolios")
    op.drop_table("investment_portfolios")
