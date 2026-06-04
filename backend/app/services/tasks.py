"""
Tâches Celery asynchrones.
- check_scheduled_sources : tâche périodique (beat) qui scanne tous les clients
- ingest_client           : ingestion complète d'un client
- ingest_source           : ingestion d'une seule source (déclenchement manuel)
"""
import logging

from app.services.scheduler import celery_app
from app.ingestion.pipeline import run_ingestion_for_client, run_ingestion_for_source

logger = logging.getLogger(__name__)


@celery_app.task(name="app.services.tasks.check_scheduled_sources")
def check_scheduled_sources() -> None:
    """
    Tâche périodique lancée par Celery Beat toutes les 5 minutes.
    Parcourt les dossiers configs/ et déclenche une ingestion pour chaque client.
    """
    from pathlib import Path

    configs_dir = Path("/app/configs")
    if not configs_dir.exists():
        logger.warning("[BEAT] Dossier configs/ introuvable.")
        return

    client_slugs = [
        d.name
        for d in configs_dir.iterdir()
        if d.is_dir() and not d.name.startswith("_")
    ]

    logger.info(f"[BEAT] {len(client_slugs)} client(s) à vérifier.")
    for slug in client_slugs:
        ingest_client.delay(slug)


@celery_app.task(
    name="app.services.tasks.ingest_client",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def ingest_client(self, client_id: str) -> dict:
    """
    Ingestion complète de toutes les sources actives d'un client.
    Retourne un résumé {chunks_stored, skipped_duplicates, errors, sources_processed}.
    """
    logger.info(f"[TASKS] Début ingestion complète pour '{client_id}'")

    try:
        summary = run_ingestion_for_client(client_id)
        logger.info(
            f"[TASKS] Ingestion terminée pour '{client_id}' : "
            f"{summary['chunks_stored']} chunks stockés, "
            f"{summary['skipped_duplicates']} doublons ignorés, "
            f"{len(summary['errors'])} erreur(s)"
        )
        return summary

    except Exception as exc:
        logger.error(f"[TASKS] Erreur inattendue pour '{client_id}' : {exc}", exc_info=True)
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.services.tasks.ingest_source",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def ingest_source(self, client_slug: str, source_id: int) -> dict:
    """
    Ingestion d'une seule source identifiée par son ID.
    Utilisée pour les déclenchements manuels via l'API.
    """
    logger.info(f"[TASKS] Début ingestion source #{source_id} pour '{client_slug}'")

    try:
        summary = run_ingestion_for_source(client_slug, source_id)
        logger.info(
            f"[TASKS] Ingestion source #{source_id} terminée : "
            f"{summary['chunks_stored']} chunks stockés, "
            f"{summary['skipped_duplicates']} doublons ignorés"
        )
        return summary

    except Exception as exc:
        logger.error(
            f"[TASKS] Erreur source #{source_id} pour '{client_slug}' : {exc}",
            exc_info=True,
        )
        raise self.retry(exc=exc)