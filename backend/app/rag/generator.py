"""
Generator : construit le prompt à partir des chunks récupérés
et interroge le LLM pour produire une réponse sourcée.

Stack : LlamaIndex (llama-index-llms-openai / llama-index-llms-openai-like)
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from app.services.llm import get_llm
from app.rag.retriever import RetrievedChunk

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt système
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Tu es un assistant expert en veille concurrentielle.
Tu réponds uniquement à partir des extraits de documents fournis ci-dessous.
Si la réponse ne peut pas être déterminée à partir de ces extraits, dis-le clairement.
Ne fabrique pas d'informations.

Règles de formatage :
- Réponds en français sauf si la question est dans une autre langue.
- Sois précis et synthétique.
- Ne liste PAS les sources à la fin de ta réponse. Les sources sont gérées automatiquement par l'interface."""

MAX_CONTEXT_CHARS = 12_000


# ---------------------------------------------------------------------------
# Réponse complète
# ---------------------------------------------------------------------------

async def generate(
    question: str,
    chunks: list[RetrievedChunk],
    conversation_history: list[dict] | None = None,
) -> dict:
    """
    Génère une réponse complète à partir des chunks récupérés.

    Returns:
        {
            "answer": str,
            "sources": [{"title", "url", "source_type", "score", "excerpt"}]
        }
    """
    if not chunks:
        return {
            "answer": (
                "Je n'ai pas trouvé d'informations pertinentes dans les documents "
                "disponibles pour répondre à cette question."
            ),
            "sources": [],
        }

    llm = get_llm()
    prompt = _build_prompt(question, chunks, conversation_history)

    try:
        response = await _call_llm(llm, prompt)
    except Exception as exc:
        logger.error(f"[GENERATOR] Erreur appel LLM : {exc}", exc_info=True)
        raise

    logger.info(
        f"[GENERATOR] Réponse générée ({len(response)} chars, "
        f"{len(chunks)} sources) pour '{question[:60]}'"
    )

    return {
        "answer": response.strip(),
        "sources": _format_sources(chunks),
    }


# ---------------------------------------------------------------------------
# Streaming
# ---------------------------------------------------------------------------

async def stream_generate(
    question: str,
    chunks: list[RetrievedChunk],
    conversation_history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Génère une réponse en streaming, token par token."""
    if not chunks:
        yield (
            "Je n'ai pas trouvé d'informations pertinentes dans les documents "
            "disponibles pour répondre à cette question."
        )
        return

    llm = get_llm()
    prompt = _build_prompt(question, chunks, conversation_history)

    try:
        async for token in _stream_llm(llm, prompt):
            yield token
    except Exception as exc:
        logger.error(f"[GENERATOR] Erreur streaming LLM : {exc}", exc_info=True)
        yield "\n\n[Erreur lors de la génération de la réponse]"


# ---------------------------------------------------------------------------
# Construction du prompt (texte brut, compatible LlamaIndex)
# ---------------------------------------------------------------------------

def _build_prompt(
    question: str,
    chunks: list[RetrievedChunk],
    conversation_history: list[dict] | None,
) -> str:
    context_block = _build_context_block(chunks)

    history_block = ""
    if conversation_history:
        lines = []
        for turn in conversation_history[-6:]:
            role = turn.get("role", "")
            content = turn.get("content", "")
            if role == "user":
                lines.append(f"Utilisateur : {content}")
            elif role == "assistant":
                lines.append(f"Assistant : {content}")
        if lines:
            history_block = "\n\nHistorique de la conversation :\n" + "\n".join(lines)

    prompt = (
        f"{SYSTEM_PROMPT}"
        f"{history_block}"
        f"\n\nVoici des extraits de documents pertinents :\n\n"
        f"{context_block}"
        f"\n\n---\nQuestion : {question}\n\nRéponse :"
    )
    return prompt


def _build_context_block(chunks: list[RetrievedChunk]) -> str:
    parts: list[str] = []
    total_chars = 0

    for i, chunk in enumerate(chunks, start=1):
        excerpt = chunk.text.strip()
        if len(excerpt) > 2000:
            excerpt = excerpt[:2000] + "…"

        block = (
            f"[Extrait {i}]\n"
            f"Source : {chunk.title}\n"
            f"URL : {chunk.url}\n"
            f"Type : {chunk.source_type}\n"
            f"Pertinence : {chunk.score:.2f}\n\n"
            f"{excerpt}"
        )

        if total_chars + len(block) > MAX_CONTEXT_CHARS:
            logger.debug(f"[GENERATOR] Contexte tronqué à {i - 1} chunks ({total_chars} chars)")
            break

        parts.append(block)
        total_chars += len(block)

    return "\n\n---\n\n".join(parts)


# ---------------------------------------------------------------------------
# Appels LLM via LlamaIndex
# ---------------------------------------------------------------------------

async def _call_llm(llm, prompt: str) -> str:
    import asyncio
    try:
        response = await llm.acomplete(prompt)
        return str(response)
    except (AttributeError, NotImplementedError):
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(None, llm.complete, prompt)
        return str(response)


async def _stream_llm(llm, prompt: str) -> AsyncGenerator[str, None]:
    import asyncio
    try:
        async for chunk in await llm.astream_complete(prompt):
            delta = chunk.delta
            if delta:
                yield delta
    except (AttributeError, NotImplementedError):
        loop = asyncio.get_running_loop()

        def _collect():
            tokens = []
            for chunk in llm.stream_complete(prompt):
                if chunk.delta:
                    tokens.append(chunk.delta)
            return tokens

        tokens = await loop.run_in_executor(None, _collect)
        for token in tokens:
            yield token


# ---------------------------------------------------------------------------
# Formatage des sources
# ---------------------------------------------------------------------------

def _format_sources(chunks: list[RetrievedChunk]) -> list[dict]:
    return [
        {
            "title": chunk.title,
            "url": chunk.url,
            "source_type": chunk.source_type,
            "score": chunk.score,
            "excerpt": chunk.text[:300].strip() + ("…" if len(chunk.text) > 300 else ""),
        }
        for chunk in chunks
    ]