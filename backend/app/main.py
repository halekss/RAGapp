"""
Point d'entrée FastAPI.
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.api.routes import chat, clients, ingestion, sources


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging()
    # Ici : initialisation DB, connexion Qdrant, etc. (étapes suivantes)
    yield
    # Ici : nettoyage des ressources


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Competitive RAG API",
        description="Assistant de veille concurrentielle par RAG",
        version="0.1.0",
        docs_url="/docs" if settings.is_dev else None,
        redoc_url="/redoc" if settings.is_dev else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat"])
    app.include_router(sources.router, prefix="/api/v1/sources", tags=["Sources"])
    app.include_router(ingestion.router, prefix="/api/v1/ingestion", tags=["Ingestion"])
    app.include_router(clients.router, prefix="/api/v1/clients", tags=["Clients"])

    @app.get("/health", tags=["Health"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "env": settings.app_env}

    return app


app = create_app()