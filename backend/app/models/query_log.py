"""
Modèle QueryLog : log des requêtes et réponses RAG pour chaque client.
"""
import uuid
from typing import Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class QueryLog(Base):
    __tablename__ = "query_logs"

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
    query: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sources: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    client: Mapped["Client"] = relationship("Client", back_populates="query_logs")

    def __repr__(self) -> str:
        return f"<QueryLog client_id={self.client_id!r} query={self.query[:50]!r}>"
