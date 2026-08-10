"""sygnia_investments_v2

Revision ID: c9f1a3b2d4e6
Revises: b8e4d2f0a3c5
Create Date: 2026-08-10 17:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'c9f1a3b2d4e6'
down_revision = 'b8e4d2f0a3c5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'sygnia_logins',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('username_encrypted', sa.String(), nullable=False),
        sa.Column('password_encrypted', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sygnia_logins_id'), 'sygnia_logins', ['id'], unique=False)
    op.create_index(op.f('ix_sygnia_logins_user_id'), 'sygnia_logins', ['user_id'], unique=False)

    op.create_table(
        'sygnia_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('login_id', sa.Integer(), nullable=False),
        sa.Column('account_code', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('account_type_name', sa.String(), nullable=True),
        sa.Column('account_type_code', sa.String(), nullable=True),
        sa.Column('foreign_allocation', sa.Float(), nullable=True),
        sa.Column('reg28_compliant', sa.Boolean(), nullable=True),
        sa.Column('as_of_date', sa.Date(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        sa.Column('last_sync_status', sa.String(), nullable=True),
        sa.Column('last_sync_error', sa.Text(), nullable=True),
        sa.Column('holdings_total_market_value', sa.String(), nullable=True),
        sa.Column('holdings_total_percentage', sa.String(), nullable=True),
        sa.Column('retirement_account_market_value', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['login_id'], ['sygnia_logins.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'account_code', name='uq_sygnia_accounts_user_account_code'),
    )
    op.create_index(op.f('ix_sygnia_accounts_account_code'), 'sygnia_accounts', ['account_code'], unique=False)
    op.create_index(op.f('ix_sygnia_accounts_id'), 'sygnia_accounts', ['id'], unique=False)
    op.create_index(op.f('ix_sygnia_accounts_login_id'), 'sygnia_accounts', ['login_id'], unique=False)
    op.create_index(op.f('ix_sygnia_accounts_user_id'), 'sygnia_accounts', ['user_id'], unique=False)

    op.create_table(
        'sygnia_holdings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('investment_code', sa.String(), nullable=False),
        sa.Column('investment_name', sa.String(), nullable=False),
        sa.Column('units', sa.String(), nullable=True),
        sa.Column('unit_price', sa.String(), nullable=True),
        sa.Column('market_value', sa.String(), nullable=True),
        sa.Column('percentage', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['sygnia_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sygnia_holdings_account_id'), 'sygnia_holdings', ['account_id'], unique=False)
    op.create_index(op.f('ix_sygnia_holdings_id'), 'sygnia_holdings', ['id'], unique=False)

    op.create_table(
        'sygnia_retirement_components',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('component', sa.String(), nullable=False),
        sa.Column('market_value', sa.String(), nullable=True),
        sa.Column('benefit_lines', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['sygnia_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_sygnia_retirement_components_account_id'),
        'sygnia_retirement_components',
        ['account_id'],
        unique=False,
    )
    op.create_index(op.f('ix_sygnia_retirement_components_id'), 'sygnia_retirement_components', ['id'], unique=False)

    op.create_table(
        'sygnia_beneficiaries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('relationship', sa.String(), nullable=True),
        sa.Column('allocation', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['sygnia_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_sygnia_beneficiaries_account_id'), 'sygnia_beneficiaries', ['account_id'], unique=False)
    op.create_index(op.f('ix_sygnia_beneficiaries_id'), 'sygnia_beneficiaries', ['id'], unique=False)

    op.create_table(
        'sygnia_debit_orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('debit_order_amount', sa.String(), nullable=True),
        sa.Column('escalation_rate', sa.String(), nullable=True),
        sa.Column('escalation_month', sa.String(), nullable=True),
        sa.Column('day_of_month', sa.String(), nullable=True),
        sa.Column('effective_date', sa.String(), nullable=True),
        sa.Column('linked_bank', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['sygnia_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('account_id', name='uq_sygnia_debit_orders_account_id'),
    )
    op.create_index(op.f('ix_sygnia_debit_orders_account_id'), 'sygnia_debit_orders', ['account_id'], unique=True)
    op.create_index(op.f('ix_sygnia_debit_orders_id'), 'sygnia_debit_orders', ['id'], unique=False)

    op.create_table(
        'sygnia_debit_order_allocations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('debit_order_id', sa.Integer(), nullable=False),
        sa.Column('investment_code', sa.String(), nullable=True),
        sa.Column('investment_name', sa.String(), nullable=True),
        sa.Column('allocation', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['debit_order_id'], ['sygnia_debit_orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_sygnia_debit_order_allocations_debit_order_id'),
        'sygnia_debit_order_allocations',
        ['debit_order_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_sygnia_debit_order_allocations_id'),
        'sygnia_debit_order_allocations',
        ['id'],
        unique=False,
    )

    op.create_table(
        'sygnia_value_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('record_date', sa.Date(), nullable=False),
        sa.Column('portfolio_value', sa.Float(), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['sygnia_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('account_id', 'record_date', name='uq_sygnia_value_history_account_record_date'),
    )
    op.create_index(op.f('ix_sygnia_value_history_account_id'), 'sygnia_value_history', ['account_id'], unique=False)
    op.create_index(op.f('ix_sygnia_value_history_id'), 'sygnia_value_history', ['id'], unique=False)
    op.create_index(op.f('ix_sygnia_value_history_record_date'), 'sygnia_value_history', ['record_date'], unique=False)

    op.create_table(
        'sygnia_contributions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('contribution_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['sygnia_accounts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'account_id',
            'contribution_date',
            name='uq_sygnia_contributions_account_contribution_date',
        ),
    )
    op.create_index(op.f('ix_sygnia_contributions_account_id'), 'sygnia_contributions', ['account_id'], unique=False)
    op.create_index(
        op.f('ix_sygnia_contributions_contribution_date'),
        'sygnia_contributions',
        ['contribution_date'],
        unique=False,
    )
    op.create_index(op.f('ix_sygnia_contributions_id'), 'sygnia_contributions', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_sygnia_contributions_id'), table_name='sygnia_contributions')
    op.drop_index(op.f('ix_sygnia_contributions_contribution_date'), table_name='sygnia_contributions')
    op.drop_index(op.f('ix_sygnia_contributions_account_id'), table_name='sygnia_contributions')
    op.drop_table('sygnia_contributions')

    op.drop_index(op.f('ix_sygnia_value_history_record_date'), table_name='sygnia_value_history')
    op.drop_index(op.f('ix_sygnia_value_history_id'), table_name='sygnia_value_history')
    op.drop_index(op.f('ix_sygnia_value_history_account_id'), table_name='sygnia_value_history')
    op.drop_table('sygnia_value_history')

    op.drop_index(op.f('ix_sygnia_debit_order_allocations_id'), table_name='sygnia_debit_order_allocations')
    op.drop_index(
        op.f('ix_sygnia_debit_order_allocations_debit_order_id'),
        table_name='sygnia_debit_order_allocations',
    )
    op.drop_table('sygnia_debit_order_allocations')

    op.drop_index(op.f('ix_sygnia_debit_orders_id'), table_name='sygnia_debit_orders')
    op.drop_index(op.f('ix_sygnia_debit_orders_account_id'), table_name='sygnia_debit_orders')
    op.drop_table('sygnia_debit_orders')

    op.drop_index(op.f('ix_sygnia_beneficiaries_id'), table_name='sygnia_beneficiaries')
    op.drop_index(op.f('ix_sygnia_beneficiaries_account_id'), table_name='sygnia_beneficiaries')
    op.drop_table('sygnia_beneficiaries')

    op.drop_index(op.f('ix_sygnia_retirement_components_id'), table_name='sygnia_retirement_components')
    op.drop_index(op.f('ix_sygnia_retirement_components_account_id'), table_name='sygnia_retirement_components')
    op.drop_table('sygnia_retirement_components')

    op.drop_index(op.f('ix_sygnia_holdings_id'), table_name='sygnia_holdings')
    op.drop_index(op.f('ix_sygnia_holdings_account_id'), table_name='sygnia_holdings')
    op.drop_table('sygnia_holdings')

    op.drop_index(op.f('ix_sygnia_accounts_user_id'), table_name='sygnia_accounts')
    op.drop_index(op.f('ix_sygnia_accounts_login_id'), table_name='sygnia_accounts')
    op.drop_index(op.f('ix_sygnia_accounts_id'), table_name='sygnia_accounts')
    op.drop_index(op.f('ix_sygnia_accounts_account_code'), table_name='sygnia_accounts')
    op.drop_table('sygnia_accounts')

    op.drop_index(op.f('ix_sygnia_logins_user_id'), table_name='sygnia_logins')
    op.drop_index(op.f('ix_sygnia_logins_id'), table_name='sygnia_logins')
    op.drop_table('sygnia_logins')
