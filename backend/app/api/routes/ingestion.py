from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/ingestion", tags=["ingestion"])


class IngestRequest(BaseModel):
    source_id: str
    url: str
    source_type: str


@router.post("/{source_id}")
async def trigger_ingestion(source_id: str, url: str, source_type: str):
    """Déclenche l'ingestion d'une source."""
    if not source_id or not url:
        raise HTTPException(status_code=400, detail="source_id et url requis")
    return {"status": "queued", "source_id": source_id}


@router.get("/status/{task_id}")
async def get_ingestion_status(task_id: str):
    """Récupère le statut d'une ingestion."""
    return {"task_id": task_id, "status": "pending"}
