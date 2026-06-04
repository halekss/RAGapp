"""
Embedder.

Prend une liste de TextChunk produits par le chunker, les envoie au modèle
d'embedding (LM Studio ou OpenAI selon la config), puis stocke les vecteurs
résultants dans Qdrant.

Les chunks sont envoyés par lots pour éviter des centaines d'appels réseau
individuels, ce qui est particulièrement important avec un modèle local.

Dépendances : qdrant-client, llama-index (via services/llm.py)
"""

import logging
import uuid
from datetime import datetime

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PointStruct,
    VectorParams,
)

from app.core.config import get_settings
from app.services.llm import get_embedding_model
from .chunker import TextChunk

logger = logging.getLogger(__name__)

# Taille de lot par défaut : 32 chunks envoyés en une seule requête au modèle.
# Raisonnable pour un GPU local, ajustable si la VRAM est limitée.
DEFAULT_BATCH_SIZE = 32


def embed_and_store(
    chunks: list[TextChunk],
    client_id: str,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> int:
    """
    Transforme les chunks en vecteurs et les stocke dans Qdrant.

    Retourne le nombre de chunks effectivement stockés.

    `client_id` détermine la collection Qdrant utilisée : chaque client
    a sa propre collection, ce qui garantit l'isolation des données
    entre clients (multi-tenancy).
    """
    if not chunks:
        logger.warning(f"[EMBEDDER] Aucun chunk à embedder pour {client_id}")
        return 0

    settings = get_settings()
    qdrant = _get_qdrant_client(settings)
    collection_name = _ensure_collection(qdrant, client_id, settings)

    embedding_model = get_embedding_model()
    total_stored = 0

    # Traitement par lots
    batches = _make_batches(chunks, batch_size)
    logger.info(
        f"[EMBEDDER] {len(chunks)} chunks à traiter en {len(batches)} lots "
        f"(taille lot : {batch_size}) pour {client_id}"
    )

    for batch_index, batch in enumerate(batches):
        texts = [chunk.content for chunk in batch]

        try:
            vectors = embedding_model.get_text_embedding_batch(texts, show_progress=False)
        except Exception as exc:
            logger.error(
                f"[EMBEDDER] Erreur d'embedding sur le lot {batch_index} : {exc}"
            )
            continue

        points = [
            _chunk_to_point(chunk, vector)
            for chunk, vector in zip(batch, vectors)
        ]

        try:
            qdrant.upsert(collection_name=collection_name, points=points)
            total_stored += len(points)
            logger.debug(
                f"[EMBEDDER] Lot {batch_index + 1}/{len(batches)} stocké "
                f"({len(points)} points)"
            )
        except Exception as exc:
            logger.error(
                f"[EMBEDDER] Erreur Qdrant sur le lot {batch_index} : {exc}"
            )

    logger.info(
        f"[EMBEDDER] {total_stored}/{len(chunks)} chunks stockés "
        f"dans la collection '{collection_name}'"
    )
    return total_stored


# ---------------------------------------------------------------------------
# Fonctions internes
# ---------------------------------------------------------------------------

def _get_qdrant_client(settings) -> QdrantClient:
    """Instancie le client Qdrant depuis la configuration."""
    return QdrantClient(
        host=settings.qdrant_host,
        port=settings.qdrant_port,
    )


def _ensure_collection(
    qdrant: QdrantClient, client_id: str, settings
) -> str:
    """
    S'assure que la collection Qdrant du client existe.
    La crée si elle n'existe pas encore, ne fait rien sinon.

    Le nom de la collection est simplement le client_id,
    ce qui garantit l'isolation entre clients.
    """
    collection_name = client_id
    existing = {c.name for c in qdrant.get_collections().collections}

    if collection_name not in existing:
        logger.info(
            f"[EMBEDDER] Création de la collection Qdrant '{collection_name}'"
        )
        qdrant.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=settings.embedding_dimension,
                distance=Distance.COSINE,
            ),
        )

    return collection_name


def _chunk_to_point(chunk: TextChunk, vector: list[float]) -> PointStruct:
    """
    Convertit un TextChunk + son vecteur en PointStruct Qdrant.

    Le payload (métadonnées) stocké avec chaque vecteur permet de retrouver
    l'origine exacte du chunk lors d'une recherche : URL source, titre,
    position dans le document, etc.
    """
    return PointStruct(
        id=str(uuid.uuid4()),
        vector=vector,
        payload={
            "content": chunk.content,
            "client_id": chunk.client_id,
            "source_url": chunk.source_url,
            "source_title": chunk.source_title,
            "source_type": chunk.source_type.value,
            "chunk_index": chunk.chunk_index,
            "total_chunks": chunk.total_chunks,
            "collected_at": chunk.collected_at.isoformat(),
            "extra": chunk.extra,
        },
    )


def _make_batches(chunks: list[TextChunk], batch_size: int) -> list[list[TextChunk]]:
    """Découpe une liste de chunks en sous-listes de taille batch_size."""
    return [
        chunks[i: i + batch_size]
        for i in range(0, len(chunks), batch_size)
    ]