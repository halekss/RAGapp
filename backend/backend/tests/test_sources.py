import pytest
from httpx import AsyncClient
from app.main import app
from app.db.session import get_db
from app.models.source import Source
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import uuid


@pytest.fixture
async def test_db():
    """Crée une DB de test en mémoire."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        from app.models import Base
        await conn.run_sync(Base.metadata.create_all)
    
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async def override_get_db():
        async with SessionLocal() as session:
            yield session
    
    app.dependency_overrides[get_db] = override_get_db
    yield SessionLocal
    await engine.dispose()


@pytest.mark.asyncio
async def test_create_source(test_db):
    """Test création d'une source."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/sources/", json={
            "client_id": "client-1",
            "url": "https://example.com/rss",
            "source_type": "rss"
        })
    assert response.status_code == 200
    data = response.json()
    assert data["url"] == "https://example.com/rss"
    assert data["source_type"] == "rss"


@pytest.mark.asyncio
async def test_list_sources(test_db):
    """Test liste des sources."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Crée une source
        response = await client.post("/sources/", json={
            "client_id": "client-1",
            "url": "https://example.com",
            "source_type": "web"
        })
        assert response.status_code == 200
        
        # Liste
        response = await client.get("/sources/?client_id=client-1")
        assert response.status_code == 200
        sources = response.json()
        assert len(sources) == 1
        assert sources[0]["url"] == "https://example.com"


@pytest.mark.asyncio
async def test_get_source_not_found(test_db):
    """Test récupération source inexistante."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/sources/nonexistent")
    assert response.status_code == 404
