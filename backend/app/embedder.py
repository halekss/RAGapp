import httpx
from app.core.config import get_settings

settings = get_settings()


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Vectorise une liste de textes via LM Studio."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.active_base_url}/embeddings",
            json={"model": settings.active_embedding_model, "input": texts},
            timeout=60,
        )
        response.raise_for_status()

    data = response.json()
    return [item["embedding"] for item in data["data"]]
