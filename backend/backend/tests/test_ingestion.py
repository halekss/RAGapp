import pytest
from app.routes.ingestion import router


def test_ingestion_router_exists():
    """Vérifie que le router ingestion existe."""
    assert router is not None
    assert router.prefix == "/ingestion"


def test_ingestion_request_model():
    """Teste le modèle IngestRequest."""
    from app.routes.ingestion import IngestRequest
    request = IngestRequest(
        source_id="src-1",
        url="https://example.com",
        source_type="rss"
    )
    assert request.source_id == "src-1"
    assert request.source_type == "rss"
