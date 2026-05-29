"""
Factory LLM et Embedding.
Retourne les clients LlamaIndex adaptés selon le fournisseur configuré
(LM Studio ou OpenAI), sans que le reste du code ait à s'en préoccuper.
"""
from functools import lru_cache

from llama_index.core.embeddings import BaseEmbedding
from llama_index.core.llms import LLM

from app.core.config import get_settings


@lru_cache
def get_llm() -> LLM:
    """Retourne le LLM actif selon LLM_PROVIDER."""
    settings = get_settings()

    if settings.llm_provider == "lmstudio":
        from llama_index.llms.openai_like import OpenAILike
        return OpenAILike(
            model=settings.lmstudio_llm_model,
            api_base=settings.lmstudio_base_url,
            api_key="lm-studio",   # LM Studio n'exige pas de vraie clé
            is_chat_model=True,
            context_window=8192,
        )

    # OpenAI
    from llama_index.llms.openai import OpenAI
    return OpenAI(
        model=settings.default_llm_model,
        api_key=settings.openai_api_key,
    )


@lru_cache
def get_embedding_model() -> BaseEmbedding:
    """Retourne le modèle d'embedding actif selon LLM_PROVIDER."""
    settings = get_settings()

    if settings.llm_provider == "lmstudio":
        from llama_index.embeddings.openai import OpenAIEmbedding
        return OpenAIEmbedding(
            model_name=settings.lmstudio_embedding_model,
            api_base=settings.lmstudio_base_url,
            api_key="lm-studio",
        )

    # OpenAI
    from llama_index.embeddings.openai import OpenAIEmbedding
    return OpenAIEmbedding(
        model_name=settings.default_embedding_model,
        api_key=settings.openai_api_key,
    )