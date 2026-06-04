"""add sector and role to clients

Revision ID: a2f3c1d8e9b4
Revises: # remplacer par le revision ID de ta migration initiale
Create Date: 2026-06-04

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a2f3c1d8e9b4"
down_revision: Union[str, None] = "0001_initial_schema"  # ← remplacer par l'ID de la migration initiale
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column("sector", sa.String(length=150), nullable=True),
    )
    op.add_column(
        "clients",
        sa.Column("role", sa.String(length=32), nullable=False, server_default="client"),
    )


def downgrade() -> None:
    op.drop_column("clients", "role")
    op.drop_column("clients", "sector")