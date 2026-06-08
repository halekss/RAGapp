"""
Chain : orchestration du pipeline RAG complet.

Ce fichier remplace le stub précédent et expose les deux fonctions
attendues par chat.py :
  - answer_question()   → réponse complète
  - stream_answer()     → réponse en streaming (SSE)

Flux :
  question → retriever (Qdrant) → generator (LLM) → réponse sourcée
"""
from __future__ import annotations

import logging
import time
from typing import AsyncGenerator

from app.rag.retriever import retrieve, RetrievedChunk
from app.rag.generator import generate, stream_generate, _format_sources

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Réponse complète
# ---------------------------------------------------------------------------

async def answer_question(
    question: str,
    client_slug: str,
    top_k: int = 5,
    score_threshold: float = 0.45,
    conversation_history: list[dict] | None = None,
) -> dict:
    """
    Pose une question au pipeline RAG et retourne la réponse complète.

    Returns:
        {
            "answer": str,
            "sources": [{"title", "url", "source_type", "score", "excerpt"}],
            "chunks_used": int,
            "processing_time_ms": int,
        }
    """
    start = time.perf_counter()

    logger.info(
        f"[CHAIN] Question reçue : '{question[:80]}' "
        f"(client={client_slug}, top_k={top_k})"
    )

    chunks: list[RetrievedChunk] = await retrieve(
        question=question,
        client_slug=client_slug,
        top_k=top_k,
        score_threshold=score_threshold,
    )

    logger.info(f"[CHAIN] {len(chunks)} chunks récupérés")

    result = await generate(
        question=question,
        chunks=chunks,
        conversation_history=conversation_history,
    )

    elapsed_ms = int((time.perf_counter() - start) * 1000)

    logger.info(
        f"[CHAIN] Réponse produite en {elapsed_ms} ms "
        f"({len(result['sources'])} sources)"
    )

    return {
        **result,
        "chunks_used": len(chunks),
        "processing_time_ms": elapsed_ms,
    }


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------

async def stream_answer(
    question: str,
    client_slug: str,
    top_k: int = 5,
    score_threshold: float = 0.45,
    conversation_history: list[dict] | None = None,
) -> AsyncGenerator[str | list, None]:
    """
    Pose une question au pipeline RAG et stream la réponse token par token.

    Yields:
        - En premier : la liste des chunks récupérés (list[RetrievedChunk]),
          pour que chat.py puisse les inclure dans l'événement SSE "done".
        - Ensuite : les tokens de texte (str) de la réponse LLM.
    """
    logger.info(
        f"[CHAIN] Streaming question : '{question[:80]}' "
        f"(client={client_slug})"
    )

    chunks: list[RetrievedChunk] = await retrieve(
        question=question,
        client_slug=client_slug,
        top_k=top_k,
        score_threshold=score_threshold,
    )

    logger.info(f"[CHAIN] {len(chunks)} chunks récupérés (streaming)")

    # Premier yield : les chunks pour que chat.py puisse les sérialiser
    yield chunks

    # Puis les tokens de réponse
    async for token in stream_generate(
        question=question,
        chunks=chunks,
        conversation_history=conversation_history,
    ):
        yield token


# ---------------------------------------------------------------------------
# Utilitaire : métadonnées des sources sans générer de réponse
# ---------------------------------------------------------------------------

async def retrieve_only(
    question: str,
    client_slug: str,
    top_k: int = 5,
    score_threshold: float = 0.45,
) -> list[dict]:
    """
    Retourne uniquement les sources pertinentes sans appeler le LLM.
    Pratique pour tester la qualité du retrieval indépendamment
    de la génération.
    """
    chunks = await retrieve(
        question=question,
        client_slug=client_slug,
        top_k=top_k,
        score_threshold=score_threshold,
    )
    return [
        {
            "title": c.title,
            "url": c.url,
            "source_type": c.source_type,
            "score": c.score,
            "excerpt": c.text[:300].strip(),
            "chunk_index": c.chunk_index,
            "ingested_at": c.ingested_at,
        }
        for c in chunks
    ]