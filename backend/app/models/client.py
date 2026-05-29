"""
Modèle Client : représente un tenant (un client de la plateforme).
Chaque client a son namespace Qdrant isolé et sa propre clé API.
"""
import uuid

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    slug: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Namespace Qdrant : égal au slug par convention
    @property
    def qdrant_namespace(self) -> str:
        return self.slug

    # Relations
    sources: Mapped[list["Source"]] = relationship(  # type: ignore[name-defined]
        "Source", back_populates="client", cascade="all, delete-orphan"
    )
    query_logs: Mapped[list["QueryLog"]] = relationship(  # type: ignore[name-defined]
        "QueryLog", back_populates="client", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Client slug={self.slug!r} active={self.is_active}>"