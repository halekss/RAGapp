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
from app.rag.generator import generate, stream_generate

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

    Args:
        question:             La question posée par l'utilisateur.
        client_slug:          Identifiant du client (namespace Qdrant).
        top_k:                Nombre de chunks à récupérer.
        score_threshold:      Score de similarité minimum pour retenir un chunk.
        conversation_history: Historique de la conversation (tours précédents).

    Returns:
        {
            "answer": str,
            "sources": [
                {
                    "title": str,
                    "url": str,
                    "source_type": str,
                    "score": float,
                    "excerpt": str,
                }
            ],
            "chunks_used": int,
            "processing_time_ms": int,
        }

    Raises:
        Exception : toute erreur de retrieval ou de génération est propagée
                    vers la route API qui s'occupe du logging et du code HTTP.
    """
    start = time.perf_counter()

    logger.info(
        f"[CHAIN] Question reçue : '{question[:80]}' "
        f"(client={client_slug}, top_k={top_k})"
    )

    # ---- Étape 1 : Retrieval ----
    chunks: list[RetrievedChunk] = await retrieve(
        question=question,
        client_slug=client_slug,
        top_k=top_k,
        score_threshold=score_threshold,
    )

    logger.info(f"[CHAIN] {len(chunks)} chunks récupérés")

    # ---- Étape 2 : Generation ----
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
) -> AsyncGenerator[str, None]:
    """
    Pose une question au pipeline RAG et stream la réponse token par token.

    Le premier événement SSE envoyé par chat.py contient les métadonnées
    (sources, chunks_used) ; les suivants contiennent les tokens de réponse.

    Yields:
        Tokens de texte de la réponse.
    """
    logger.info(
        f"[CHAIN] Streaming question : '{question[:80]}' "
        f"(client={client_slug})"
    )

    # ---- Étape 1 : Retrieval (même logique que la version non-streaming) ----
    chunks: list[RetrievedChunk] = await retrieve(
        question=question,
        client_slug=client_slug,
        top_k=top_k,
        score_threshold=score_threshold,
    )

    logger.info(f"[CHAIN] {len(chunks)} chunks récupérés (streaming)")

    # ---- Étape 2 : Génération en streaming ----
    async for token in stream_generate(
        question=question,
        chunks=chunks,
        conversation_history=conversation_history,
    ):
        yield token


# ---------------------------------------------------------------------------
# Utilitaire : métadonnées des sources sans générer de réponse
# (utile pour les tests et le debug)
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