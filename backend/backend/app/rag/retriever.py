from qdrant_client import AsyncQdrantClient
from app.core.config import get_settings

settings = get_settings()
COLLECTION = "documents"


async def retrieve(query: str, top_k: int = 5) -> list[dict]:
    """Récupère les chunks similaires à la requête depuis Qdrant."""
    from app.embedder import embed_texts
    
    # Vectorise la requête
    query_embedding = await embed_texts([query])
    query_vector = query_embedding[0]
    
    # Recherche dans Qdrant
    client = AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    results = await client.search(
        collection_name=COLLECTION,
        query_vector=query_vector,
        limit=top_k,
        with_payload=True,
    )
    await client.close()
    
    # Retourne les résultats
    return [
        {
            "text": result.payload["text"],
            "source_id": result.payload["source_id"],
            "url": result.payload["url"],
            "score": result.score,
        }
        for result in results
    ]
