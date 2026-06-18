"""phase 8: add workflows table

Revision ID: b7d2f4a9c1e3
Revises: e6bafd0b7929
Create Date: 2026-06-14 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d2f4a9c1e3'
down_revision: Union[str, Sequence[str], None] = 'e6bafd0b7929'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'workflows',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('graph', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('workflows', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_workflows_user_id'), ['user_id'], unique=False
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('workflows', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_workflows_user_id'))

    op.drop_table('workflows')
