"""
Tâches Celery asynchrones.
"""
import logging

from app.services.scheduler import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.services.tasks.check_scheduled_sources")
def check_scheduled_sources() -> dict[str, str]:
    """
    Vérifie toutes les sources dont le schedule est échu et lance leur ingestion.
    Implémentation complète à l'étape pipeline d'ingestion.
    """
    logger.info("Vérification des sources planifiées")
    return {"status": "ok"}


@celery_app.task(name="app.services.tasks.ingest_source", bind=True, max_retries=3)
def ingest_source(self, source_id: str, client_slug: str) -> dict[str, str]:
    """
    Ingère une source spécifique : collecte, chunking, embedding, stockage Qdrant.
    Implémentation complète à l'étape pipeline d'ingestion.
    """
    logger.info(f"Ingestion source {source_id} pour client {client_slug}")
    return {"status": "ok", "source_id": source_id}