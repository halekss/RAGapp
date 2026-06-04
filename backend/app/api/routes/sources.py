from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.source import Source
from pydantic import BaseModel
from datetime import datetime
import uuid

router = APIRouter(prefix="/sources", tags=["sources"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


class SourceCreate(BaseModel):
    client_id: str
    url: str
    source_type: str


class SourceResponse(BaseModel):
    id: str
    client_id: str
    url: str
    source_type: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/")
async def list_sources(client_id: str, db: AsyncSession = Depends(get_db)):
    """Liste les sources d'un client."""
    stmt = select(Source).where(Source.client_id == client_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/")
async def create_source(data: SourceCreate, db: AsyncSession = Depends(get_db)):
    """Crée une source."""
    source = Source(
        id=str(uuid.uuid4()),
        client_id=data.client_id,
        url=data.url,
        source_type=data.source_type,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return source


@router.get("/{source_id}")
async def get_source(source_id: str, db: AsyncSession = Depends(get_db)):
    """Récupère une source."""
    stmt = select(Source).where(Source.id == source_id)
    result = await db.execute(stmt)
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


@router.delete("/{source_id}")
async def delete_source(source_id: str, db: AsyncSession = Depends(get_db)):
    """Supprime une source."""
    stmt = select(Source).where(Source.id == source_id)
    result = await db.execute(stmt)
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    await db.delete(source)
    await db.commit()
    return {"detail": "Source deleted"}
