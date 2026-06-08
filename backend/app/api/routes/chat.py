"""
Route de chat : endpoint Q&A principal de l'application.
Reçoit une question en langage naturel, interroge le pipeline RAG
(retriever + generator) et retourne une réponse sourcée.
Supporte aussi le streaming SSE pour les interfaces temps réel.
"""
import json
import time
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentClient
from app.core.database import get_db as get_session
from app.models.query_log import QueryLog
from app.rag.chain import answer_question, stream_answer
from app.rag.generator import _format_sources

router = APIRouter()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Schémas Pydantic
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=2000)
    top_k: int = Field(5, ge=1, le=20)
    score_threshold: float = Field(0.5, ge=0.0, le=1.0)
    conversation_history: list[dict] | None = None


class SourceReference(BaseModel):
    title: str
    url: str
    source_type: str
    score: float
    excerpt: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceReference]
    query_log_id: str
    processing_time_ms: int


class ChatHistoryItem(BaseModel):
    id: str
    question: str
    answer: str | None
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

    sources = rag_result.get("sources", [])
    log_entry = QueryLog(
        client_id=current_client.id,
        question=payload.question,
        answer=rag_result["answer"],
        retrieval_ms=processing_time_ms,
        llm_model=current_client.slug,
    )
    session.add(log_entry)
    await session.commit()
    await session.refresh(log_entry)

    return {
        "answer": rag_result["answer"],
        "sources": sources,
        "query_log_id": str(log_entry.id),
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
    async def event_generator() -> AsyncGenerator[str, None]:
        start_time = time.monotonic()
        full_answer = ""
        chunks = []

        try:
            stream = stream_answer(
                question=payload.question,
                client_slug=current_client.slug,
                top_k=payload.top_k,
                score_threshold=payload.score_threshold,
                conversation_history=payload.conversation_history or [],
            )

            async for item in stream:
                # Premier yield de stream_answer : la liste des chunks
                if isinstance(item, list):
                    chunks = item
                    continue

                # Tous les yields suivants : tokens de texte
                full_answer += item
                yield f"data: {json.dumps({'type': 'token', 'content': item})}\n\n"

        except Exception as exc:
            logger.error(f"[CHAT_STREAM] Erreur pour '{current_client.slug}' : {exc}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': 'Erreur durant la génération.'})}\n\n"
            return

        processing_time_ms = int((time.monotonic() - start_time) * 1000)

        log_entry = QueryLog(
            client_id=current_client.id,
            question=payload.question,
            answer=full_answer,
            retrieval_ms=processing_time_ms,
            llm_model=current_client.slug,
        )
        session.add(log_entry)
        await session.commit()
        await session.refresh(log_entry)

        # Événement final : métadonnées + sources structurées
        yield f"data: {json.dumps({'type': 'done', 'query_log_id': str(log_entry.id), 'processing_time_ms': processing_time_ms, 'sources': _format_sources(chunks)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
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
    result = await session.execute(
        select(QueryLog)
        .where(QueryLog.client_id == current_client.id)
        .order_by(desc(QueryLog.created_at))
        .limit(limit)
        .offset(offset)
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "question": log.question,
            "answer": log.answer,
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
    await session.execute(
        delete(QueryLog).where(QueryLog.client_id == current_client.id)
    )
    await session.commit()