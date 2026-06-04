"""
Tâches Celery.

Deux tâches :
- check_scheduled_sources : tournée périodique (beat), lit tous les clients
  configurés et déclenche une ingestion pour chacun.
- ingest_client : ingère toutes les sources d'un client donné.
  Appelable manuellement via la route API ou automatiquement par le beat.
"""

import logging
from pathlib import Path

import yaml

from app.core.config import get_settings
from app.services.scheduler import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.services.tasks.check_scheduled_sources")
def check_scheduled_sources() -> dict:
    """
    Tâche périodique déclenchée par Celery Beat.

    Parcourt tous les dossiers de configs clients et lance une tâche
    d'ingestion pour chacun. Le scheduling fin (cron par source) sera
    implémenté dans une itération future — pour l'instant, tous les clients
    sont ingérés à chaque passage du beat.
    """
    settings = get_settings()
    configs_dir = settings.configs_dir

    if not configs_dir.exists():
        logger.warning(f"[TASKS] Dossier configs introuvable : {configs_dir}")
        return {"status": "error", "reason": "configs_dir introuvable"}

    client_ids = [
        d.name
        for d in configs_dir.iterdir()
        if d.is_dir() and not d.name.startswith("_")  # ignore _template
    ]

    if not client_ids:
        logger.info("[TASKS] Aucun client configuré")
        return {"status": "ok", "clients_triggered": 0}

    for client_id in client_ids:
        logger.info(f"[TASKS] Déclenchement de l'ingestion pour {client_id}")
        ingest_client.delay(client_id)

    return {"status": "ok", "clients_triggered": len(client_ids)}


@celery_app.task(
    name="app.services.tasks.ingest_client",
    bind=True,
    max_retries=3,
    default_retry_delay=60,  # secondes entre les retentatives
)
def ingest_client(self, client_id: str) -> dict:
    """
    Ingère toutes les sources d'un client.

    En cas d'erreur inattendue, Celery retentera automatiquement
    jusqu'à max_retries fois avec un délai de default_retry_delay secondes.
    """
    from app.ingestion.pipeline import run_ingestion_for_client

    try:
        summary = run_ingestion_for_client(client_id)
        logger.info(
            f"[TASKS] Ingestion terminée pour {client_id} : "
            f"{summary['chunks_stored']} chunks stockés, "
            f"{summary['skipped_duplicates']} doublons ignorés, "
            f"{len(summary['errors'])} erreurs"
        )
        return summary

    except Exception as exc:
        logger.error(
            f"[TASKS] Erreur inattendue pour {client_id} : {exc}",
            exc_info=True,
        )
        raise self.retry(exc=exc)