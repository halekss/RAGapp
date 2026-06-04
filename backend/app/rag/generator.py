"""Generator - LLM response generation with context."""
import httpx
from app.core.config import get_settings


async def generate(query: str, context: list[str]) -> str:
    """
    Generate a response using LM Studio based on query and retrieved context.
    """
    settings = get_settings()
    context_text = "\n".join(context)

    prompt = f"""You are a helpful assistant analyzing competitive intelligence.

Based on the following context, answer the user's question concisely and accurately.
If the context doesn't contain relevant information, say so.

Context:
{context_text}

Question: {query}

Answer:"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{settings.active_base_url}/chat/completions",
            json={
                "model": settings.active_llm_model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                "temperature": 0.7,
                "max_tokens": 512,
            },
            timeout=60,
        )
        response.raise_for_status()

    data = response.json()
    return data["choices"][0]["message"]["content"]
