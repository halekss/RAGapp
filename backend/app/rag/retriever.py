"""Retriever - semantic search in Qdrant."""
from qdrant_client import AsyncQdrantClient
from app.embedder import embed_texts
from app.core.config import get_settings

COLLECTION = "documents"


async def retrieve(query: str, top_k: int = 5) -> list[dict]:
    """
    Search Qdrant for documents relevant to the query.
    Returns list of (text, source_id, url, score).
    """
    settings = get_settings()
    embeddings = await embed_texts([query])
    query_embedding = embeddings[0]

    client = AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)

    results = await client.search(
        collection_name=COLLECTION,
        query_vector=query_embedding,
        limit=top_k,
    )

    await client.close()

    retrieved_docs = []
    for point in results:
        retrieved_docs.append({
            "text": point.payload["text"],
            "source_id": point.payload["source_id"],
            "url": point.payload["url"],
            "score": point.score,
        })

    return retrieved_docs