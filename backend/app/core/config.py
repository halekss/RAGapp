"""
Configuration centrale de l'application.
Toutes les valeurs sont lues depuis les variables d'environnement ou le fichier .env.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import Field
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
    celery_broker_url: str = Field(default="redis://localhost:6379/0")
    celery_result_backend: str = Field(default="redis://localhost:6379/1")

    # --- LLM ---
    openai_api_key: str = Field(default="")
    default_llm_model: str = Field(default="gpt-4o-mini")
    default_embedding_model: str = Field(default="text-embedding-3-small")

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