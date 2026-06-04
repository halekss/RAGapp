"""
Dépendances injectées dans les routes FastAPI.
Résolution du client courant depuis la clé API fournie en header.
"""
import hashlib
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db as get_session
from app.models.client import Client

settings = get_settings()


def _hash_api_key(raw_key: str) -> str:
    """Reproduit le hachage SHA-256 salté utilisé à la création de la clé."""
    salted = f"{settings.api_key_salt}{raw_key}"
    return hashlib.sha256(salted.encode()).hexdigest()


async def get_current_client(
    x_api_key: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_session),
) -> Client:
    """
    Résout le client courant à partir du header X-Api-Key.
    Lève une 401 si la clé est absente ou invalide.
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header X-Api-Key manquant.",
        )

    hashed = _hash_api_key(x_api_key)
    result = await session.execute(
        select(Client).where(Client.api_key_hash == hashed, Client.is_active == True)  # noqa: E712
    )
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clé API invalide ou client inactif.",
        )

    return client


# Raccourci pour l'injection dans les routes
CurrentClient = Annotated[Client, Depends(get_current_client)]


async def get_admin_client(
    client: CurrentClient,
) -> Client:
    """
    Variante réservée aux opérations admin (ex : création/suppression de clients).
    Vérifie que le client a le rôle 'admin'.
    """
    if client.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs.",
        )
    return client


AdminClient = Annotated[Client, Depends(get_admin_client)]