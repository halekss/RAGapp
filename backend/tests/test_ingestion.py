import pytest
from app.api.routes.ingestion import router, IngestRequest


def test_ingestion_router_exists():
    assert router is not None
    assert router.prefix == "/ingestion"


def test_ingest_request_model():
    request = IngestRequest(
        source_id="src-1",
        url="https://example.com",
        source_type="rss"
    )
    assert request.source_id == "src-1"
    assert request.source_type == "rss"
