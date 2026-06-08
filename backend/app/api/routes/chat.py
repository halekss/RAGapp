"""
Route de chat : endpoint Q&A principal de l'application.
Reçoit une question en langage naturel, interroge le pipeline RAG
(retriever + generator) et retourne une réponse sourcée.
Supporte aussi le streaming SSE pour les interfaces temps réel.
"""
import time
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentClient
from app.core.database import get_db as get_session
from app.models.query_log import QueryLog
from app.rag.chain import answer_question, answer_question_stream

router = APIRouter()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Schémas Pydantic
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=2000, description="Question en langage naturel")
    top_k: int = Field(5, ge=1, le=20, description="Nombre de chunks à récupérer")
    score_threshold: float = Field(0.5, ge=0.0, le=1.0, description="Score de similarité minimum")
    conversation_history: list[dict] | None = Field(
        None,
        description="Historique optionnel [{role: user|assistant, content: str}]",
    )


class SourceReference(BaseModel):
    title: str
    url: str
    source_type: str
    score: float
    excerpt: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceReference]
    query_log_id: int
    processing_time_ms: int


class ChatHistoryItem(BaseModel):
    id: int
    question: str
    answer: str
    sources_count: int
    processing_time_ms: int | None
    created_at: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=ChatResponse,
    summary="Poser une question (réponse complète)",
)
async def chat(
    payload: ChatRequest,
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Endpoint principal du chat. Envoie la question au pipeline RAG
    et retourne la réponse complète avec les sources citées.
    """
    start_time = time.monotonic()

    try:
        rag_result = await answer_question(
            question=payload.question,
            client_slug=current_client.slug,
            top_k=payload.top_k,
            score_threshold=payload.score_threshold,
            conversation_history=payload.conversation_history or [],
        )
    except Exception as exc:
        logger.error(
            f"[CHAT] Erreur pipeline RAG pour '{current_client.slug}' : {exc}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le pipeline RAG a rencontré une erreur. Réessayez dans quelques instants.",
        )

    processing_time_ms = int((time.monotonic() - start_time) * 1000)

    # Persister la question / réponse dans query_logs
    log_entry = QueryLog(
        client_id=current_client.id,
        query_type="chat",
        question=payload.question,
        answer=rag_result["answer"],
        sources_count=len(rag_result.get("sources", [])),
        processing_time_ms=processing_time_ms,
        metadata={
            "top_k": payload.top_k,
            "score_threshold": payload.score_threshold,
            "chunks_used": len(rag_result.get("sources", [])),
        },
    )
    session.add(log_entry)
    await session.commit()
    await session.refresh(log_entry)

    return {
        "answer": rag_result["answer"],
        "sources": rag_result.get("sources", []),
        "query_log_id": log_entry.id,
        "processing_time_ms": processing_time_ms,
    }


@router.post(
    "/stream",
    summary="Poser une question (réponse en streaming SSE)",
    response_class=StreamingResponse,
)
async def chat_stream(
    payload: ChatRequest,
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """
    Variante streaming : retourne la réponse token par token via Server-Sent Events.
    Le frontend peut afficher la réponse au fur et à mesure de sa génération.

    Format SSE :
      data: {"type": "token", "content": "..."}
      data: {"type": "sources", "sources": [...]}
      data: {"type": "done", "query_log_id": 42, "processing_time_ms": 1200}
    """
    import json

    async def event_generator() -> AsyncGenerator[str, None]:
        start_time = time.monotonic()
        full_answer = ""
        sources = []

        try:
            async for chunk in answer_question_stream(
                question=payload.question,
                client_slug=current_client.slug,
                top_k=payload.top_k,
                score_threshold=payload.score_threshold,
                conversation_history=payload.conversation_history or [],
            ):
                if chunk["type"] == "token":
                    full_answer += chunk["content"]
                    yield f"data: {json.dumps(chunk)}\n\n"

                elif chunk["type"] == "sources":
                    sources = chunk["sources"]
                    yield f"data: {json.dumps(chunk)}\n\n"

        except Exception as exc:
            logger.error(f"[CHAT_STREAM] Erreur pour '{current_client.slug}' : {exc}", exc_info=True)
            error_event = {"type": "error", "message": "Erreur durant la génération."}
            yield f"data: {json.dumps(error_event)}\n\n"
            return

        processing_time_ms = int((time.monotonic() - start_time) * 1000)

        # Persister en base après la fin du stream
        log_entry = QueryLog(
            client_id=current_client.id,
            query_type="chat_stream",
            question=payload.question,
            answer=full_answer,
            sources_count=len(sources),
            processing_time_ms=processing_time_ms,
            metadata={"top_k": payload.top_k, "score_threshold": payload.score_threshold},
        )
        session.add(log_entry)
        await session.commit()
        await session.refresh(log_entry)

        done_event = {
            "type": "done",
            "query_log_id": log_entry.id,
            "processing_time_ms": processing_time_ms,
        }
        yield f"data: {json.dumps(done_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Désactive le buffering Nginx pour le SSE
        },
    )


@router.get(
    "/history",
    response_model=list[ChatHistoryItem],
    summary="Historique des questions du client courant",
)
async def get_chat_history(
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
    limit: int = 20,
    offset: int = 0,
) -> list:
    """
    Retourne les dernières questions posées par le client authentifié,
    avec les réponses associées. Utilisé pour afficher l'historique dans le frontend.
    """
    from sqlalchemy import select, desc
    from app.models.query_log import QueryLog

    result = await session.execute(
        select(QueryLog)
        .where(
            QueryLog.client_id == current_client.id,
            QueryLog.query_type.in_(["chat", "chat_stream"]),
        )
        .order_by(desc(QueryLog.created_at))
        .limit(limit)
        .offset(offset)
    )
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "question": log.question,
            "answer": log.answer,
            "sources_count": log.sources_count or 0,
            "processing_time_ms": log.processing_time_ms,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.delete(
    "/history",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Effacer l'historique du client courant",
)
async def clear_chat_history(
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Supprime tous les query_logs de type chat du client authentifié."""
    from sqlalchemy import delete
    from app.models.query_log import QueryLog

    await session.execute(
        delete(QueryLog).where(
            QueryLog.client_id == current_client.id,
            QueryLog.query_type.in_(["chat", "chat_stream"]),
        )
    )
    await session.commit()