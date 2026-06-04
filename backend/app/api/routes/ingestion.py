"""
Routes de déclenchement et de suivi des ingestions.
Permet de lancer manuellement une ingestion pour le client courant
et de consulter le statut des tâches Celery en cours ou passées.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from celery.result import AsyncResult

from app.api.deps import CurrentClient, AdminClient
from app.core.database import get_db as get_session
from app.models.source import Source
from app.services.scheduler import celery_app
from app.services.tasks import ingest_client, ingest_source

router = APIRouter()

# ---------------------------------------------------------------------------
# Schémas Pydantic
# ---------------------------------------------------------------------------


class IngestionTriggerOut(BaseModel):
    task_id: str
    message: str
    client_slug: str


class SourceIngestionTriggerOut(BaseModel):
    task_id: str
    message: str
    source_id: int
    source_name: str


class TaskStatusOut(BaseModel):
    task_id: str
    status: str
    result: dict | None = None
    error: str | None = None


class IngestionSummaryOut(BaseModel):
    chunks_stored: int
    skipped_duplicates: int
    errors: list[str]
    sources_processed: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/trigger",
    response_model=IngestionTriggerOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Déclencher une ingestion complète",
)
async def trigger_full_ingestion(
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Lance en arrière-plan une ingestion de toutes les sources actives
    du client courant. Retourne immédiatement un task_id pour le suivi.
    """
    # Vérifier qu'il y a au moins une source active
    result = await session.execute(
        select(Source).where(
            Source.client_id == current_client.id,
            Source.is_active == True,  # noqa: E712
        )
    )
    active_sources = result.scalars().all()

    if not active_sources:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Aucune source active trouvée pour ce client. Ajoutez des sources avant de lancer une ingestion.",
        )

    task = ingest_client.delay(current_client.slug)

    return {
        "task_id": task.id,
        "message": f"Ingestion lancée pour {len(active_sources)} source(s) active(s).",
        "client_slug": current_client.slug,
    }


@router.post(
    "/trigger/{source_id}",
    response_model=SourceIngestionTriggerOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Déclencher l'ingestion d'une source spécifique",
)
async def trigger_source_ingestion(
    source_id: int,
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Lance en arrière-plan l'ingestion d'une seule source.
    Utile pour tester une nouvelle source sans attendre le cycle planifié.
    """
    result = await session.execute(
        select(Source).where(
            Source.id == source_id,
            Source.client_id == current_client.id,
        )
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source introuvable.")

    if not source.is_active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cette source est désactivée. Activez-la avant de lancer une ingestion.",
        )

    task = ingest_source.delay(current_client.slug, source_id)

    return {
        "task_id": task.id,
        "message": f"Ingestion lancée pour la source '{source.name}'.",
        "source_id": source.id,
        "source_name": source.name,
    }


@router.get(
    "/status/{task_id}",
    response_model=TaskStatusOut,
    summary="Consulter le statut d'une tâche d'ingestion",
)
async def get_task_status(
    task_id: str,
    current_client: CurrentClient,
) -> dict:
    """
    Retourne l'état courant d'une tâche Celery identifiée par son task_id.

    Les statuts possibles sont :
    - PENDING : en attente dans la file
    - STARTED : en cours d'exécution
    - SUCCESS : terminée avec succès (result contient le résumé)
    - FAILURE : échouée (error contient le message d'erreur)
    - RETRY : en cours de nouvelle tentative
    """
    task_result = AsyncResult(task_id, app=celery_app)

    response: dict = {
        "task_id": task_id,
        "status": task_result.status,
        "result": None,
        "error": None,
    }

    if task_result.successful():
        raw = task_result.result
        # Le résultat peut être un dict ou déjà un objet structuré
        response["result"] = raw if isinstance(raw, dict) else {"raw": str(raw)}

    elif task_result.failed():
        response["error"] = str(task_result.result)

    return response


@router.get(
    "/history",
    response_model=list[dict],
    summary="Historique des ingestions du client (admin)",
)
async def get_ingestion_history(
    _admin: AdminClient,
    session: AsyncSession = Depends(get_session),
    limit: int = 20,
) -> list[dict]:
    """
    Retourne les dernières entrées de query_logs liées aux ingestions.
    Réservé aux admins pour la supervision.
    """
    from app.models.query_log import QueryLog

    result = await session.execute(
        select(QueryLog)
        .where(QueryLog.query_type == "ingestion")
        .order_by(desc(QueryLog.created_at))
        .limit(limit)
    )
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "client_id": log.client_id,
            "created_at": log.created_at.isoformat(),
            "metadata": log.metadata or {},
        }
        for log in logs
    ]