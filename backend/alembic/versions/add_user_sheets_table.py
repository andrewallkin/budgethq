"""add user sheets table

Revision ID: addusr20250101
Revises: f394d52ecd8e
Create Date: 2025-01-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'addusr20250101'
down_revision = 'f394d52ecd8e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create user_sheets table
    op.create_table('user_sheets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('sheet_name', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
        sa.UniqueConstraint('sheet_name')
    )
    op.create_index(op.f('ix_user_sheets_id'), 'user_sheets', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_sheets_id'), table_name='user_sheets')
    op.drop_table('user_sheets')
