"""
Routes de gestion des sources d'un client.
Une source représente un flux RSS, une URL à scraper ou un PDF à ingérer.
Chaque source est rattachée au client authentifié via sa clé API.
"""
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field, HttpUrl, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentClient, AdminClient
from app.core.config import get_settings
from app.core.database import get_db as get_session
from app.models.source import Source

router = APIRouter()
settings = get_settings()

CONFIGS_DIR = Path("/app/configs")

# ---------------------------------------------------------------------------
# Schémas Pydantic
# ---------------------------------------------------------------------------

SOURCE_TYPES = {"rss", "scraper", "pdf"}


class SourceCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, description="Nom lisible de la source")
    source_type: str = Field(..., description="Type : rss | scraper | pdf")
    url: str = Field(..., description="URL du flux RSS, de la page à scraper ou du PDF")
    keywords: list[str] = Field(default_factory=list, description="Mots-clés de filtrage (optionnel)")
    schedule_hours: int = Field(24, ge=1, le=168, description="Fréquence d'ingestion en heures (1–168)")
    is_active: bool = Field(True, description="Source active ou suspendue")

    @field_validator("source_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in SOURCE_TYPES:
            raise ValueError(f"source_type doit être parmi : {', '.join(SOURCE_TYPES)}")
        return v


class SourceUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=150)
    url: str | None = None
    keywords: list[str] | None = None
    schedule_hours: int | None = Field(None, ge=1, le=168)
    is_active: bool | None = None


class SourceOut(BaseModel):
    id: int
    name: str
    source_type: str
    url: str
    keywords: list[str]
    schedule_hours: int
    is_active: bool
    client_id: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Helpers YAML
# ---------------------------------------------------------------------------


def _load_client_config(slug: str) -> dict:
    config_path = CONFIGS_DIR / slug / "config.yaml"
    if not config_path.exists():
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _save_client_config(slug: str, config: dict) -> None:
    config_path = CONFIGS_DIR / slug / "config.yaml"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True, default_flow_style=False)


def _sync_sources_to_yaml(slug: str, sources: list[Source]) -> None:
    """Resynchronise la liste des sources dans le YAML du client."""
    config = _load_client_config(slug)
    config["sources"] = [
        {
            "name": s.name,
            "type": s.source_type,
            "url": s.url,
            "keywords": s.keywords or [],
            "schedule_hours": s.schedule_hours,
            "active": s.is_active,
        }
        for s in sources
        if s.is_active
    ]
    _save_client_config(slug, config)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=list[SourceOut],
    summary="Lister les sources du client courant",
)
async def list_sources(
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
    active_only: bool = False,
) -> list[Source]:
    """Retourne toutes les sources rattachées au client authentifié."""
    query = select(Source).where(Source.client_id == current_client.id)
    if active_only:
        query = query.where(Source.is_active == True)  # noqa: E712
    result = await session.execute(query.order_by(Source.name))
    return result.scalars().all()


@router.get(
    "/{source_id}",
    response_model=SourceOut,
    summary="Détails d'une source",
)
async def get_source(
    source_id: int,
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> Source:
    result = await session.execute(
        select(Source).where(Source.id == source_id, Source.client_id == current_client.id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source introuvable.")
    return source


@router.post(
    "/",
    response_model=SourceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Ajouter une source",
)
async def create_source(
    payload: SourceCreate,
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> Source:
    """
    Crée une source en base et met à jour le fichier config.yaml du client.
    """
    # Vérifier doublon URL pour ce client
    existing = await session.execute(
        select(Source).where(
            Source.client_id == current_client.id,
            Source.url == payload.url,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une source avec cette URL existe déjà pour ce client.",
        )

    source = Source(
        client_id=current_client.id,
        name=payload.name,
        source_type=payload.source_type,
        url=payload.url,
        keywords=payload.keywords,
        schedule_hours=payload.schedule_hours,
        is_active=payload.is_active,
    )
    session.add(source)
    await session.commit()
    await session.refresh(source)

    # Resynchroniser le YAML
    all_sources_result = await session.execute(
        select(Source).where(Source.client_id == current_client.id)
    )
    _sync_sources_to_yaml(current_client.slug, all_sources_result.scalars().all())

    return source


@router.patch(
    "/{source_id}",
    response_model=SourceOut,
    summary="Modifier une source",
)
async def update_source(
    source_id: int,
    payload: SourceUpdate,
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> Source:
    result = await session.execute(
        select(Source).where(Source.id == source_id, Source.client_id == current_client.id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source introuvable.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(source, field, value)

    await session.commit()
    await session.refresh(source)

    # Resynchroniser le YAML
    all_sources_result = await session.execute(
        select(Source).where(Source.client_id == current_client.id)
    )
    _sync_sources_to_yaml(current_client.slug, all_sources_result.scalars().all())

    return source


@router.delete(
    "/{source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Supprimer une source",
)
async def delete_source(
    source_id: int,
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Supprime la source en base et la retire du YAML du client."""
    result = await session.execute(
        select(Source).where(Source.id == source_id, Source.client_id == current_client.id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source introuvable.")

    await session.delete(source)
    await session.commit()

    # Resynchroniser le YAML sans la source supprimée
    all_sources_result = await session.execute(
        select(Source).where(Source.client_id == current_client.id)
    )
    _sync_sources_to_yaml(current_client.slug, all_sources_result.scalars().all())


@router.post(
    "/{source_id}/toggle",
    response_model=SourceOut,
    summary="Activer / désactiver une source",
)
async def toggle_source(
    source_id: int,
    current_client: CurrentClient,
    session: AsyncSession = Depends(get_session),
) -> Source:
    """Inverse l'état actif d'une source sans la supprimer."""
    result = await session.execute(
        select(Source).where(Source.id == source_id, Source.client_id == current_client.id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source introuvable.")

    source.is_active = not source.is_active
    await session.commit()
    await session.refresh(source)

    # Resynchroniser le YAML
    all_sources_result = await session.execute(
        select(Source).where(Source.client_id == current_client.id)
    )
    _sync_sources_to_yaml(current_client.slug, all_sources_result.scalars().all())

    return source