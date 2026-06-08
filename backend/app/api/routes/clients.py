"""
Routes de gestion des clients (multi-tenant).
Toutes les opérations de création / lecture / mise à jour / suppression
sont réservées au rôle admin, sauf la lecture du profil propre au client.
"""
import hashlib
import secrets
import uuid
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminClient, CurrentClient
from app.core.config import get_settings
from app.core.database import get_db as get_session
from app.models.client import Client
from app.models.source import Source

router = APIRouter()
settings = get_settings()

CONFIGS_DIR = Path("/app/configs")


# ---------------------------------------------------------------------------
# Schémas Pydantic
# ---------------------------------------------------------------------------


class ClientCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z0-9\-]+$")
    sector: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    sector: str | None = None
    is_active: bool | None = None


class ClientOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    sector: str | None
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class ClientCreatedOut(ClientOut):
    """Réponse à la création : inclut la clé API en clair (unique occasion)."""
    api_key: str


class ClientSummary(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    is_active: bool
    sources_count: int = 0

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _generate_api_key() -> tuple[str, str]:
    """Génère une clé API brute et son hash salté. Retourne (raw, hashed)."""
    raw = secrets.token_urlsafe(32)
    salted = f"{settings.api_key_salt}{raw}"
    hashed = hashlib.sha256(salted.encode()).hexdigest()
    return raw, hashed


def _create_client_config(slug: str, name: str, sector: str | None) -> None:
    """Crée le dossier de configuration YAML pour un nouveau client."""
    client_dir = CONFIGS_DIR / slug
    client_dir.mkdir(parents=True, exist_ok=True)
    config = {
        "client": {"name": name, "slug": slug, "sector": sector or ""},
        "sources": [],
        "rag": {"top_k": 5, "score_threshold": 0.6, "language": "fr"},
    }
    with open(client_dir / "config.yaml", "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True, default_flow_style=False)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/me", response_model=ClientOut, summary="Profil du client courant")
async def get_my_profile(current_client: CurrentClient) -> Client:
    return current_client


@router.get("/", response_model=list[ClientSummary], summary="Lister tous les clients (admin)")
async def list_clients(
    _admin: AdminClient,
    session: AsyncSession = Depends(get_session),
) -> list:
    result = await session.execute(select(Client).order_by(Client.name))
    clients = result.scalars().all()

    summaries = []
    for client in clients:
        sources_result = await session.execute(
            select(Source).where(Source.client_id == client.id)
        )
        summaries.append(ClientSummary(
            id=client.id,
            name=client.name,
            slug=client.slug,
            is_active=client.is_active,
            sources_count=len(sources_result.scalars().all()),
        ))
    return summaries


@router.get("/{client_id}", response_model=ClientOut, summary="Détails d'un client (admin)")
async def get_client(
    client_id: uuid.UUID,
    _admin: AdminClient,
    session: AsyncSession = Depends(get_session),
) -> Client:
    result = await session.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client introuvable.")
    return client


@router.post("/", response_model=ClientCreatedOut, status_code=status.HTTP_201_CREATED, summary="Créer un client (admin)")
async def create_client(
    payload: ClientCreate,
    _admin: AdminClient,
    session: AsyncSession = Depends(get_session),
) -> dict:
    existing = await session.execute(select(Client).where(Client.slug == payload.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Un client avec le slug '{payload.slug}' existe déjà.",
        )

    raw_key, hashed_key = _generate_api_key()
    client = Client(
        name=payload.name,
        slug=payload.slug,
        sector=payload.sector,
        api_key_hash=hashed_key,
        role="client",
        is_active=True,
    )
    session.add(client)
    await session.commit()
    await session.refresh(client)

    try:
        _create_client_config(payload.slug, payload.name, payload.sector)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"Impossible de créer le dossier config pour '{payload.slug}' : {exc}")

    return {
        "id": client.id,
        "name": client.name,
        "slug": client.slug,
        "sector": client.sector,
        "role": client.role,
        "is_active": client.is_active,
        "api_key": raw_key,
    }


@router.patch("/{client_id}", response_model=ClientOut, summary="Mettre à jour un client (admin)")
async def update_client(
    client_id: uuid.UUID,
    payload: ClientUpdate,
    _admin: AdminClient,
    session: AsyncSession = Depends(get_session),
) -> Client:
    result = await session.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client introuvable.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(client, field, value)

    await session.commit()
    await session.refresh(client)
    return client


@router.post("/{client_id}/rotate-key", response_model=dict, summary="Régénérer la clé API (admin)")
async def rotate_api_key(
    client_id: uuid.UUID,
    _admin: AdminClient,
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = await session.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client introuvable.")

    raw_key, hashed_key = _generate_api_key()
    client.api_key_hash = hashed_key
    await session.commit()
    return {"message": "Clé API régénérée avec succès.", "api_key": raw_key}


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Désactiver un client (admin)")
async def deactivate_client(
    client_id: uuid.UUID,
    _admin: AdminClient,
    session: AsyncSession = Depends(get_session),
) -> None:
    result = await session.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client introuvable.")

    client.is_active = False
    await session.commit()