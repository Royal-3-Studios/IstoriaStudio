"""initial

Revision ID: 86c4b24cd22b
Revises: 
Create Date: 2025-08-08 22:50:22.389491

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '86c4b24cd22b'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # If you rely on gen_random_uuid() / uuid_generate_v4(), enable extensions here
    # op.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    # op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # 1) Parents with no deps (or only internal deps)
    op.create_table(
        'asset_type',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('icon_url', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'plan',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('stripe_price_id', sa.String(), nullable=False),
        sa.Column('monthly_price_cents', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('max_generations_per_month', sa.Integer(), nullable=False),
        sa.Column('priority_gpu', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
        sa.UniqueConstraint('stripe_price_id'),
    )

    op.create_table(
        'user',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('stripe_customer_id', sa.String(), nullable=True),
        sa.Column('business_name', sa.String(), nullable=True),
        sa.Column('first_name', sa.String(), nullable=True),
        sa.Column('last_name', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('is_business', sa.Boolean(), nullable=True),
        sa.Column('keycloak_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_user_email'), 'user', ['email'], unique=True)
    op.create_index(op.f('ix_user_keycloak_id'), 'user',
                    ['keycloak_id'], unique=True)

    op.create_table(
        'prompt_type',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('icon_url', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index(op.f('ix_prompt_type_id'),
                    'prompt_type', ['id'], unique=False)

    op.create_table(
        'tag',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    # 2) Create project WITHOUT the FK to generated_asset yet (breaks the cycle)
    op.create_table(
        'project',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('is_archived', sa.Boolean(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('featured_asset_id', sa.UUID(),
                  nullable=True),  # <-- no FK here yet
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_project_featured_asset_id'),
                    'project', ['featured_asset_id'], unique=False)

    # 3) Tables that project/assets may reference
    op.create_table(
        'template',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('asset_type_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.Column('preview_url', sa.String(), nullable=True),
        sa.Column('default_prompt', sa.String(), nullable=True),
        sa.Column('style_json', sa.JSON(), nullable=True),
        sa.Column('example_overlay', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['asset_type_id'], ['asset_type.id']),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # 4) generated_asset AFTER project exists
    op.create_table(
        'generated_asset',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('is_archived', sa.Boolean(), nullable=False),
        sa.Column('format', sa.String(), nullable=True),
        sa.Column('thumbnail_url', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('resolution', sa.String(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('revision_of_id', sa.UUID(), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('style_json', sa.JSON(), nullable=True),
        sa.Column('text_overlays', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('asset_type_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('template_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['asset_type_id'], ['asset_type.id']),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.ForeignKeyConstraint(['revision_of_id'], ['generated_asset.id']),
        sa.ForeignKeyConstraint(['template_id'], ['template.id']),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # 5) The rest (depend on project/tag/etc.)
    op.create_table(
        'project_tag_link',
        sa.Column('project_id', sa.UUID(), nullable=True),
        sa.Column('tag_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.ForeignKeyConstraint(['tag_id'], ['tag.id']),
    )

    op.create_table(
        'project_update_log',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_by_email', sa.String(), nullable=True),
        sa.Column('change_summary', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'prompt_log',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('prompt_input', sa.JSON(), nullable=False),
        sa.Column('prompt_output', sa.Text(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=True),
        sa.Column('prompt_type_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['project.id']),
        sa.ForeignKeyConstraint(['prompt_type_id'], ['prompt_type.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_prompt_log_email'),
                    'prompt_log', ['email'], unique=False)
    op.create_index(op.f('ix_prompt_log_id'),
                    'prompt_log', ['id'], unique=False)

    op.create_table(
        'purchase',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(), nullable=False),
        sa.Column('is_guest', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('stripe_payment_intent_id', sa.String(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_purchase_email'),
                    'purchase', ['email'], unique=False)

    op.create_table(
        'subscription',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('plan_id', sa.UUID(), nullable=False),
        sa.Column('stripe_customer_id', sa.String(), nullable=True),
        sa.Column('stripe_subscription_id', sa.String(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['plan_id'], ['plan.id']),
        sa.ForeignKeyConstraint(['user_id'], ['user.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # 6) ADD the cycle FK LAST: project.featured_asset_id -> generated_asset.id
    op.create_foreign_key(
        'fk_project_featured_asset',
        'project', 'generated_asset',
        ['featured_asset_id'], ['id'],
        ondelete='SET NULL'  # optional; pick what you want
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop the cycle-breaking FK first
    op.drop_constraint('fk_project_featured_asset',
                       'project', type_='foreignkey')

    # Drop dependents before their parents
    op.drop_index(op.f('ix_purchase_email'), table_name='purchase')
    op.drop_table('purchase')

    op.drop_index(op.f('ix_prompt_log_id'), table_name='prompt_log')
    op.drop_index(op.f('ix_prompt_log_email'), table_name='prompt_log')
    op.drop_table('prompt_log')

    op.drop_table('project_update_log')
    op.drop_table('project_tag_link')

    # Generated asset depends on project/user/asset_type/template – drop it early
    op.drop_table('generated_asset')

    # Now template (no dependents left)
    op.drop_table('template')

    # Subscription depends on plan and user
    op.drop_table('subscription')

    # User indices then user
    op.drop_index(op.f('ix_user_keycloak_id'), table_name='user')
    op.drop_index(op.f('ix_user_email'), table_name='user')
    op.drop_table('user')

    op.drop_table('tag')

    op.drop_index(op.f('ix_prompt_type_id'), table_name='prompt_type')
    op.drop_table('prompt_type')

    op.drop_index(op.f('ix_project_featured_asset_id'), table_name='project')
    op.drop_table('project')

    op.drop_table('plan')
    op.drop_table('asset_type')
