"""
Configuration centrale de l'application.
Toutes les valeurs sont lues depuis les variables d'environnement ou le fichier .env.
"""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Application ---
    app_env: str = Field(default="development")
    secret_key: str = Field(default="change-me")
    api_key_salt: str = Field(default="change-me")

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"

    # --- PostgreSQL ---
    database_url: str = Field(
        default="postgresql+asyncpg://rag:ragpassword@localhost:5432/ragdb"
    )

    # --- Qdrant ---
    qdrant_host: str = Field(default="localhost")
    qdrant_port: int = Field(default=6333)

    # --- Redis / Celery ---
    redis_url: str = Field(default="redis://localhost:6379/0")
    celery_broker_url: str = Field(default="redis://redis:6379/0")
    celery_result_backend: str = Field(default="redis://redis:6379/1")

    # --- Fournisseur LLM ---
    llm_provider: Literal["lmstudio", "openai"] = Field(default="lmstudio")

    # --- LM Studio ---
    lmstudio_base_url: str = Field(default="http://host.docker.internal:1234/v1")
    lmstudio_llm_model: str = Field(default="meta-llama-3.1-8b-instruct")
    lmstudio_embedding_model: str = Field(default="nomic-ai/nomic-embed-text-v1.5")

    # --- OpenAI ---
    openai_api_key: str = Field(default="")
    default_llm_model: str = Field(default="gpt-4o-mini")
    default_embedding_model: str = Field(default="text-embedding-3-small")

    # --- Propriétés calculées : modèles actifs selon le fournisseur ---
    @computed_field  # type: ignore[misc]
    @property
    def active_llm_model(self) -> str:
        if self.llm_provider == "lmstudio":
            return self.lmstudio_llm_model
        return self.default_llm_model

    @computed_field  # type: ignore[misc]
    @property
    def active_embedding_model(self) -> str:
        if self.llm_provider == "lmstudio":
            return self.lmstudio_embedding_model
        return self.default_embedding_model

    @computed_field  # type: ignore[misc]
    @property
    def active_base_url(self) -> str | None:
        """Retourne la base URL uniquement pour LM Studio (None pour OpenAI natif)."""
        if self.llm_provider == "lmstudio":
            return self.lmstudio_base_url
        return None

    # --- Ingestion ---
    crawl_user_agent: str = Field(default="CompetitiveRAG/1.0")
    request_timeout_seconds: int = Field(default=30)
    max_chunk_size: int = Field(default=512)
    chunk_overlap: int = Field(default=64)

    # --- CORS ---
    frontend_origin: str = Field(default="http://localhost:3000")

    # --- Chemins ---
    configs_dir: Path = Field(default=Path("/app/configs"))


@lru_cache
def get_settings() -> Settings:
    """Retourne une instance singleton des settings (mis en cache)."""
    return Settings()