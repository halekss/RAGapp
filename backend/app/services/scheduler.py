"""
Configuration Celery : broker Redis, tâches d'ingestion planifiées.
"""
from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "competitive_rag",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.services.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Paris",
    enable_utc=True,
    task_track_started=True,
    worker_redirect_stdouts_level="INFO",
)

# Beat schedule : tâche de vérification des sources à ingérer
celery_app.conf.beat_schedule = {
    "check-scheduled-sources": {
        "task": "app.services.tasks.check_scheduled_sources",
        "schedule": 300.0,  # toutes les 5 minutes
    },
}