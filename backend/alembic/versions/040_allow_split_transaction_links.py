"""allow one credit to link to several expenses

Revision ID: a4c6e8f0b2d1
Revises: f3c5a7e9b1d2
Create Date: 2026-10-04

"""
from alembic import op


revision = "a4c6e8f0b2d1"
down_revision = "f3c5a7e9b1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f("ix_transaction_links_credit_transaction_id"), table_name="transaction_links")
    op.create_index(
        op.f("ix_transaction_links_credit_transaction_id"),
        "transaction_links",
        ["credit_transaction_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_transaction_link_credit_debit",
        "transaction_links",
        ["credit_transaction_id", "debit_transaction_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_transaction_link_credit_debit", "transaction_links", type_="unique")
    op.drop_index(op.f("ix_transaction_links_credit_transaction_id"), table_name="transaction_links")
    op.create_index(
        op.f("ix_transaction_links_credit_transaction_id"),
        "transaction_links",
        ["credit_transaction_id"],
        unique=True,
    )
