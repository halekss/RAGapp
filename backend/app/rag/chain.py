"""RAG chain - orchestration of retriever + generator."""
from app.rag.retriever import retrieve
from app.rag.generator import generate


async def rag_chain(query: str, top_k: int = 5) -> dict[str, str | list]:
    """
    Complete RAG flow: retrieve context → generate response.
    Returns {answer, sources}.
    """
    # Retrieve relevant documents
    retrieved = await retrieve(query, top_k=top_k)

    if not retrieved:
        return {
            "answer": "No relevant documents found in the knowledge base.",
            "sources": [],
        }

    # Extract context and sources
    context = [doc["text"] for doc in retrieved]
    sources = [
        {
            "url": doc["url"],
            "source_id": doc["source_id"],
            "score": doc["score"],
        }
        for doc in retrieved
    ]

    # Generate response
    answer = await generate(query, context)

    return {
        "answer": answer,
        "sources": sources,
    }
