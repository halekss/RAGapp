import uuid
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance
from app.chunker import chunk_text
from app.embedder import embed_texts
from app.core.config import get_settings

settings = get_settings()
COLLECTION = "documents"


async def get_qdrant() -> AsyncQdrantClient:
    """Crée une connexion async à Qdrant."""
    return AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)


async def ensure_collection(client: AsyncQdrantClient, vector_size: int):
    """Crée la collection Qdrant si elle n'existe pas."""
    collections = await client.get_collections()
    names = [c.name for c in collections.collections]

    if COLLECTION not in names:
        await client.create_collection(
            COLLECTION,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )


async def ingest(source_id: str, url: str, content: str):
    """Ingère un document : découpe → vectorise → stocke dans Qdrant."""
    chunks = chunk_text(content)

    if not chunks:
        return

    embeddings = await embed_texts(chunks)

    client = await get_qdrant()
    await ensure_collection(client, len(embeddings[0]))

    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={"source_id": source_id, "url": url, "text": chunk},
        )
        for chunk, embedding in zip(chunks, embeddings)
    ]

    await client.upsert(COLLECTION, points)
    await client.close()
