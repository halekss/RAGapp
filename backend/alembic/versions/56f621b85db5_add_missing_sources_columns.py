"""add_missing_sources_columns

Revision ID: 56f621b85db5
Revises: a2f3c1d8e9b4
Create Date: 2026-06-07 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '56f621b85db5'
down_revision = 'a2f3c1d8e9b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ajout des colonnes manquantes sur sources
    op.add_column('sources', sa.Column('schedule', sa.String(length=64), nullable=True))
    op.add_column('sources', sa.Column('status', sa.String(length=16), nullable=False, server_default='idle'))
    op.add_column('sources', sa.Column('last_error', sa.Text(), nullable=True))

    # Suppression des colonnes obsolètes
    op.drop_column('sources', 'last_ingested_at')
    op.drop_column('sources', 'config_json')

    # Modification du type de source_type
    op.alter_column('sources', 'source_type',
        existing_type=sa.String(length=32),
        type_=sa.String(length=16),
        existing_nullable=False
    )

    # Ajout des colonnes manquantes sur query_logs
    op.add_column('query_logs', sa.Column('source_chunk_ids', sa.JSON(), nullable=True))
    op.add_column('query_logs', sa.Column('retrieval_ms', sa.Integer(), nullable=True))
    op.add_column('query_logs', sa.Column('generation_ms', sa.Integer(), nullable=True))
    op.add_column('query_logs', sa.Column('total_tokens', sa.Integer(), nullable=True))
    op.add_column('query_logs', sa.Column('llm_model', sa.String(length=128), nullable=True))

    # Suppression des colonnes obsolètes sur query_logs
    op.drop_column('query_logs', 'sources_used')
    op.drop_column('query_logs', 'latency_ms')

    # Suppression de la contrainte unique sur clients.slug
    op.drop_constraint('uq_clients_slug', 'clients', type_='unique')


def downgrade() -> None:
    op.create_unique_constraint('uq_clients_slug', 'clients', ['slug'])
    op.add_column('query_logs', sa.Column('latency_ms', sa.Integer(), nullable=True))
    op.add_column('query_logs', sa.Column('sources_used', sa.JSON(), nullable=True))
    op.drop_column('query_logs', 'llm_model')
    op.drop_column('query_logs', 'total_tokens')
    op.drop_column('query_logs', 'generation_ms')
    op.drop_column('query_logs', 'retrieval_ms')
    op.drop_column('query_logs', 'source_chunk_ids')
    op.add_column('sources', sa.Column('config_json', sa.JSON(), nullable=True))
    op.add_column('sources', sa.Column('last_ingested_at', sa.DateTime(timezone=True), nullable=True))
    op.drop_column('sources', 'last_error')
    op.drop_column('sources', 'status')
    op.drop_column('sources', 'schedule')