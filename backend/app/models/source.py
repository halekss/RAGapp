"""
Modèle Source : une source de données rattachée à un client.
Peut être un flux RSS, une page web, un document uploadé, etc.
"""
import uuid
from enum import Enum

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class SourceType(str, Enum):
    RSS = "rss"
    PAGE = "page"
    PDF = "pdf"
    DOCX = "docx"
    API = "api"


class SourceStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[SourceType] = mapped_column(String(16), nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    schedule: Mapped[str | None] = mapped_column(String(64), nullable=True)  # cron
    status: Mapped[SourceStatus] = mapped_column(
        String(16), default=SourceStatus.ACTIVE, nullable=False
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relation
    client: Mapped["Client"] = relationship("Client", back_populates="sources")  # type: ignore[name-defined]

    def __repr__(self) -> str:
        return f"<Source name={self.name!r} type={self.source_type} status={self.status}>"