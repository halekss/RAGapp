"""
Pipeline d'ingestion.

Orchestre l'ensemble du flux pour un client donné :
    1. Lecture de la configuration YAML du client
    2. Collecte via les collecteurs appropriés (RSS, scraping, PDF)
    3. Déduplication : on saute les URLs déjà présentes dans Qdrant
    4. Chunking des documents nouveaux
    5. Embedding et stockage dans Qdrant
"""

import logging
from pathlib import Path

import yaml
from qdrant_client import QdrantClient

from app.core.config import get_settings
from .collectors import rss, scraper, pdf
from .collectors.base import CollectedDocument, SourceType
from .chunker import chunk_documents
from .embedder import embed_and_store

logger = logging.getLogger(__name__)


def run_ingestion_for_client(client_id: str) -> dict:
    """
    Point d'entrée principal du pipeline pour un client.
    Collecte toutes les sources du YAML, déduplique, chunke et embedde.
    """
    logger.info(f"[PIPELINE] Démarrage de l'ingestion pour {client_id}")
    summary = {
        "client_id": client_id,
        "collected": 0,
        "skipped_duplicates": 0,
        "chunks_produced": 0,
        "chunks_stored": 0,
        "errors": [],
    }

    config = _load_client_config(client_id)
    if config is None:
        msg = f"Configuration introuvable pour le client '{client_id}'"
        logger.error(f"[PIPELINE] {msg}")
        summary["errors"].append(msg)
        return summary

    sources_raw = config.get("sources", {})
    sources_config: list[dict] = []
    if isinstance(sources_raw, list):
        sources_config = sources_raw
    elif isinstance(sources_raw, dict):
        for source_type, items in sources_raw.items():
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        item.setdefault("type", source_type)
                        sources_config.append(item)
    chunker_config: dict = config.get("chunker", {})

    if not sources_config:
        logger.warning(f"[PIPELINE] Aucune source configurée pour {client_id}")
        return summary

    all_documents: list[CollectedDocument] = []
    for source_conf in sources_config:
        source_type = source_conf.get("type", "").lower()
        docs = _collect_source(source_conf, source_type, client_id, summary)
        all_documents.extend(docs)

    summary["collected"] = len(all_documents)
    logger.info(f"[PIPELINE] {len(all_documents)} documents collectés pour {client_id}")

    if not all_documents:
        return summary

    settings = get_settings()
    qdrant = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    new_documents = _deduplicate(all_documents, qdrant, client_id)
    summary["skipped_duplicates"] = len(all_documents) - len(new_documents)

    if not new_documents:
        logger.info(f"[PIPELINE] Aucun nouveau document pour {client_id}, rien à faire")
        return summary

    logger.info(
        f"[PIPELINE] {len(new_documents)} nouveaux documents après déduplication "
        f"({summary['skipped_duplicates']} ignorés)"
    )

    chunks = chunk_documents(new_documents, chunker_config)
    summary["chunks_produced"] = len(chunks)

    if not chunks:
        logger.warning(f"[PIPELINE] Aucun chunk produit pour {client_id}")
        return summary

    stored = embed_and_store(chunks, client_id)
    summary["chunks_stored"] = stored

    logger.info(
        f"[PIPELINE] Ingestion terminée pour {client_id} : "
        f"{stored} chunks stockés"
    )
    return summary


def run_ingestion_for_source(client_slug: str, source_url: str) -> dict:
    """
    Ingestion d'une seule source identifiée par son URL.

    L'URL est la clé naturelle commune entre la base PostgreSQL et le YAML.
    Cherche la source dans le YAML du client par correspondance d'URL.
    """
    logger.info(f"[PIPELINE] Démarrage ingestion source '{source_url}' pour '{client_slug}'")
    summary = {
        "client_id": client_slug,
        "collected": 0,
        "skipped_duplicates": 0,
        "chunks_produced": 0,
        "chunks_stored": 0,
        "errors": [],
    }

    config = _load_client_config(client_slug)
    if config is None:
        msg = f"Configuration introuvable pour le client '{client_slug}'"
        logger.error(f"[PIPELINE] {msg}")
        summary["errors"].append(msg)
        return summary

    chunker_config: dict = config.get("chunker", {})
    sources_raw = config.get("sources", [])

    # Normaliser sources_raw en liste de dicts
    sources_config: list[dict] = []
    if isinstance(sources_raw, list):
        sources_config = sources_raw
    elif isinstance(sources_raw, dict):
        for stype, items in sources_raw.items():
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        item.setdefault("type", stype)
                        sources_config.append(item)

    # Chercher la source par URL dans le YAML
    source_conf = next(
        (s for s in sources_config if s.get("url") == source_url),
        None,
    )

    if source_conf is None:
        msg = f"Source '{source_url}' introuvable dans la config de '{client_slug}'"
        logger.error(f"[PIPELINE] {msg}")
        summary["errors"].append(msg)
        return summary

    source_type = source_conf.get("type", "").lower()
    documents = _collect_source(source_conf, source_type, client_slug, summary)
    summary["collected"] = len(documents)

    if not documents:
        return summary

    settings = get_settings()
    qdrant = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    new_documents = _deduplicate(documents, qdrant, client_slug)
    summary["skipped_duplicates"] = len(documents) - len(new_documents)

    if not new_documents:
        logger.info(f"[PIPELINE] Aucun nouveau document pour source '{source_url}'")
        return summary

    chunks = chunk_documents(new_documents, chunker_config)
    summary["chunks_produced"] = len(chunks)

    if not chunks:
        return summary

    stored = embed_and_store(chunks, client_slug)
    summary["chunks_stored"] = stored

    logger.info(f"[PIPELINE] Source '{source_url}' : {stored} chunks stockés")
    return summary


# ---------------------------------------------------------------------------
# Fonctions internes
# ---------------------------------------------------------------------------

def _load_client_config(client_id: str) -> dict | None:
    settings = get_settings()
    config_path = settings.configs_dir / client_id / "config.yaml"

    if not config_path.exists():
        local_path = Path("backend/configs") / client_id / "config.yaml"
        if local_path.exists():
            config_path = local_path
        else:
            return None

    with open(config_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _collect_source(
    source_conf: dict,
    source_type: str,
    client_id: str,
    summary: dict,
) -> list[CollectedDocument]:
    try:
        if source_type == SourceType.RSS.value:
            return rss.collect(source_conf, client_id)
        elif source_type == SourceType.SCRAPING.value:
            import asyncio
            return asyncio.run(scraper.collect(source_conf, client_id))
        elif source_type == SourceType.PDF.value:
            return pdf.collect(source_conf, client_id)
        else:
            msg = f"Type de source inconnu : '{source_type}'"
            logger.warning(f"[PIPELINE] {msg}")
            summary["errors"].append(msg)
            return []
    except Exception as exc:
        msg = f"Erreur sur la source '{source_type}' : {exc}"
        logger.error(f"[PIPELINE] {msg}", exc_info=True)
        summary["errors"].append(msg)
        return []


def _deduplicate(
    documents: list[CollectedDocument],
    qdrant: QdrantClient,
    client_id: str,
) -> list[CollectedDocument]:
    existing_collections = {c.name for c in qdrant.get_collections().collections}

    if client_id not in existing_collections:
        return documents

    from qdrant_client.models import FieldCondition, Filter, MatchValue

    new_documents = []
    for doc in documents:
        results = qdrant.scroll(
            collection_name=client_id,
            scroll_filter=Filter(
                must=[
                    FieldCondition(
                        key="source_url",
                        match=MatchValue(value=doc.url),
                    )
                ]
            ),
            limit=1,
            with_payload=False,
            with_vectors=False,
        )
        if len(results[0]) == 0:
            new_documents.append(doc)
        else:
            logger.debug(f"[PIPELINE] Déjà ingéré, ignoré : {doc.url}")

    return new_documents