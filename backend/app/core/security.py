"""
Authentification par API Key.
Chaque client reçoit une clé générée au moment de sa création.
La clé est hashée en base, jamais stockée en clair.
"""
import hashlib
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader

from app.core.config import get_settings

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=True)


def generate_api_key() -> tuple[str, str]:
    """
    Génère une paire (clé brute, hash).
    La clé brute est transmise une seule fois au client.
    Seul le hash est persisté en base.
    """
    raw = secrets.token_urlsafe(32)
    hashed = _hash_key(raw)
    return raw, hashed


def _hash_key(raw_key: str) -> str:
    settings = get_settings()
    salted = f"{settings.api_key_salt}:{raw_key}"
    return hashlib.sha256(salted.encode()).hexdigest()


def verify_api_key(raw_key: str, stored_hash: str) -> bool:
    return secrets.compare_digest(_hash_key(raw_key), stored_hash)


async def get_api_key(
    api_key: Annotated[str, Security(API_KEY_HEADER)],
) -> str:
    """
    Dépendance FastAPI : valide que le header X-API-Key est présent.
    La vérification complète (comparaison avec la BDD) est faite dans deps.py.
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key manquante",
        )
    return api_key