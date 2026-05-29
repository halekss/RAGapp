"""
Modèle QueryLog : trace chaque question posée par un analyste.
Utilisé pour l'audit, les statistiques d'usage et l'amélioration continue.
"""
import uuid

from sqlalchemy import Float, ForeignKey, Integer, Text
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
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Chunks Qdrant utilisés pour générer la réponse (IDs séparés par virgule)
    source_chunk_ids: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Métriques de performance
    retrieval_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generation_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    llm_model: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relation
    client: Mapped["Client"] = relationship("Client", back_populates="query_logs")  # type: ignore[name-defined]

    def __repr__(self) -> str:
        preview = self.question[:50] + "..." if len(self.question) > 50 else self.question
        return f"<QueryLog client={self.client_id} question={preview!r}>"