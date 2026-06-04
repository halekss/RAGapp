from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.client import Client
from pydantic import BaseModel
from datetime import datetime
import uuid

router = APIRouter(prefix="/clients", tags=["clients"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


class ClientCreate(BaseModel):
    name: str


class ClientResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/")
async def list_clients(db: AsyncSession = Depends(get_db)):
    """Liste tous les clients."""
    stmt = select(Client)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/")
async def create_client(data: ClientCreate, db: AsyncSession = Depends(get_db)):
    """Crée un client."""
    client = Client(
        id=str(uuid.uuid4()),
        name=data.name,
    )
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client


@router.get("/{client_id}")
async def get_client(client_id: str, db: AsyncSession = Depends(get_db)):
    """Récupère un client."""
    stmt = select(Client).where(Client.id == client_id)
    result = await db.execute(stmt)
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.delete("/{client_id}")
async def delete_client(client_id: str, db: AsyncSession = Depends(get_db)):
    """Supprime un client."""
    stmt = select(Client).where(Client.id == client_id)
    result = await db.execute(stmt)
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.delete(client)
    await db.commit()
    return {"detail": "Client deleted"}
