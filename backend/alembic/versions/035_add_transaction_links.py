"""add_transaction_links

Revision ID: b8e4d2f0a3c5
Revises: a7f3c1e9d2b8
Create Date: 2026-06-14 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b8e4d2f0a3c5'
down_revision = 'a7f3c1e9d2b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'transaction_links',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('debit_transaction_id', sa.Integer(), nullable=False),
        sa.Column('credit_transaction_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['credit_transaction_id'], ['bank_transactions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['debit_transaction_id'], ['bank_transactions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_transaction_links_credit_transaction_id'), 'transaction_links', ['credit_transaction_id'], unique=True)
    op.create_index(op.f('ix_transaction_links_debit_transaction_id'), 'transaction_links', ['debit_transaction_id'], unique=False)
    op.create_index(op.f('ix_transaction_links_id'), 'transaction_links', ['id'], unique=False)
    op.create_index(op.f('ix_transaction_links_user_id'), 'transaction_links', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_transaction_links_user_id'), table_name='transaction_links')
    op.drop_index(op.f('ix_transaction_links_id'), table_name='transaction_links')
    op.drop_index(op.f('ix_transaction_links_debit_transaction_id'), table_name='transaction_links')
    op.drop_index(op.f('ix_transaction_links_credit_transaction_id'), table_name='transaction_links')
    op.drop_table('transaction_links')
