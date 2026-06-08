"""
Retriever : recherche les chunks les plus pertinents dans Qdrant.

Étapes :
1. Embed la question avec le même modèle que l'ingestion
2. Recherche par similarité dans le namespace du client
3. Filtre par score et déduplique par URL si besoin
4. Retourne une liste de chunks enrichis (texte + métadonnées)
"""
from __future__ import annotations

import asyncio
import inspect
import logging
from dataclasses import dataclass

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

from app.core.config import settings
from app.services.llm import get_embedding_model

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Structures de données
# ---------------------------------------------------------------------------

@dataclass
class RetrievedChunk:
    """Un chunk récupéré depuis Qdrant avec son score de pertinence."""
    text: str
    url: str
    title: str
    source_type: str   # "rss" | "scraper" | "pdf"
    score: float
    chunk_index: int
    ingested_at: str   # ISO 8601


# ---------------------------------------------------------------------------
# Client Qdrant (synchrone, wrappé en async via run_in_executor)
# ---------------------------------------------------------------------------

def _get_qdrant_client() -> QdrantClient:
    return QdrantClient(
        host=settings.qdrant_host,
        port=settings.qdrant_port,
    )


# ---------------------------------------------------------------------------
# Fonction principale
# ---------------------------------------------------------------------------

async def retrieve(
    question: str,
    client_slug: str,
    top_k: int = 5,
    score_threshold: float = 0.45,
    source_type_filter: str | None = None,
) -> list[RetrievedChunk]:
    """
    Recherche les chunks les plus pertinents pour une question donnée.
    """
    embedder = get_embedding_model()
    qdrant = _get_qdrant_client()

    # 1. Embedding de la question
    try:
        question_vector = await _embed_question(embedder, question)
    except Exception as exc:
        logger.error(f"[RETRIEVER] Erreur embedding question : {exc}", exc_info=True)
        raise

    # 2. Construction du filtre optionnel par type de source
    qdrant_filter: Filter | None = None
    if source_type_filter:
        qdrant_filter = Filter(
            must=[
                FieldCondition(
                    key="source_type",
                    match=MatchValue(value=source_type_filter),
                )
            ]
        )

    # 3. Recherche dans la collection du client (sync dans executor)
    collection_name = client_slug
    try:
        loop = asyncio.get_running_loop()
        results = await loop.run_in_executor(
            None,
            lambda: qdrant.query_points(
                collection_name=collection_name,
                query=question_vector,
                limit=top_k * 2,
                score_threshold=score_threshold,
                query_filter=qdrant_filter,
                with_payload=True,
            ).points
        )
    except Exception as exc:
        logger.error(
            f"[RETRIEVER] Erreur recherche Qdrant (collection={collection_name}) : {exc}",
            exc_info=True,
        )
        raise

    if not results:
        logger.info(
            f"[RETRIEVER] Aucun chunk trouvé pour '{question[:60]}' "
            f"(client={client_slug}, threshold={score_threshold})"
        )
        return []

    # 4. Conversion + déduplication par URL (on garde le meilleur score par URL)
    seen_urls: dict[str, RetrievedChunk] = {}
    for hit in results:
        payload = hit.payload or {}
        url = payload.get("url", "")
        chunk = RetrievedChunk(
            text=payload.get("content", ""),
            url=payload.get("source_url", ""),
            title=payload.get("source_title", url),
            source_type=payload.get("source_type", "unknown"),
            score=round(hit.score, 4),
            chunk_index=payload.get("chunk_index", 0),
            ingested_at=payload.get("ingested_at", ""),
        )
        if url not in seen_urls or chunk.score > seen_urls[url].score:
            seen_urls[url] = chunk

    # 5. Re-trier et limiter à top_k
    chunks = sorted(seen_urls.values(), key=lambda c: c.score, reverse=True)[:top_k]

    logger.info(
        f"[RETRIEVER] {len(chunks)} chunks retenus pour '{question[:60]}' "
        f"(client={client_slug})"
    )
    return chunks


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _embed_question(embedder, question: str) -> list[float]:
    """
    Embed la question. Supporte les embedders sync et async.
    """
    result = embedder.get_text_embedding(question)
    if inspect.isawaitable(result):
        return await result
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, embedder.get_text_embedding, question)