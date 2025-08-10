"""SET NULL on generated_asset.project_id and make nullable

Revision ID: 204abdbf74b6
Revises: 066e1ad87484
Create Date: 2025-08-10 00:11:38.842137

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '204abdbf74b6'
down_revision: Union[str, Sequence[str], None] = '066e1ad87484'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
