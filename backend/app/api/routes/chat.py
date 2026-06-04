"""Chat routes - RAG Q&A endpoint."""
import time
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.query_log import QueryLog
from app.rag.chain import rag_chain
from app.core.config import get_settings

router = APIRouter()


class ChatRequest(BaseModel):
    query: str
    client_id: uuid.UUID


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    query_id: uuid.UUID


@router.post("/ask")
async def ask_question(
    request: ChatRequest,
    session: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """
    Ask a question and get an answer from the RAG system.
    Stores the query in the database for auditing and metrics.
    """
    query_id = uuid.uuid4()
    settings = get_settings()

    try:
        # Retrieve and generate
        start_time = time.time()
        result = await rag_chain(request.query, top_k=5)
        elapsed_ms = int((time.time() - start_time) * 1000)

        # Store query log
        log = QueryLog(
            id=query_id,
            client_id=request.client_id,
            question=request.query,
            answer=result["answer"],
            source_chunk_ids=",".join(
                str(src["source_id"]) for src in result["sources"]
            ),
            retrieval_ms=elapsed_ms,
            llm_model=settings.llm_model,
        )
        session.add(log)
        await session.commit()

        return ChatResponse(
            answer=result["answer"],
            sources=result["sources"],
            query_id=query_id,
        )

    except Exception as e:
        # Log the error query
        log = QueryLog(
            id=query_id,
            client_id=request.client_id,
            question=request.query,
            answer=None,
            llm_model=settings.llm_model,
        )
        session.add(log)
        await session.commit()

        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{client_id}")
async def get_chat_history(
    client_id: uuid.UUID,
    limit: int = 50,
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Get query history for a client."""
    from sqlalchemy import select, desc

    stmt = (
        select(QueryLog)
        .where(QueryLog.client_id == client_id)
        .order_by(desc(QueryLog.created_at))
        .limit(limit)
    )
    result = await session.execute(stmt)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "question": log.question,
            "answer": log.answer,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
