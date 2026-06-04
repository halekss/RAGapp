import pytest
from app.api.routes.sources import SourceCreate, SourceResponse
from app.api.routes.clients import ClientCreate, ClientResponse
from app.api.routes.ingestion import IngestRequest


def test_source_create_model():
    """Test modèle SourceCreate."""
    source = SourceCreate(
        client_id="test-client",
        url="https://example.com",
        source_type="rss"
    )
    assert source.client_id == "test-client"
    assert source.source_type == "rss"


def test_client_create_model():
    """Test modèle ClientCreate."""
    client = ClientCreate(name="Test Client")
    assert client.name == "Test Client"


def test_ingest_request_model():
    """Test modèle IngestRequest."""
    request = IngestRequest(
        source_id="src-123",
        url="https://example.com",
        source_type="web"
    )
    assert request.source_id == "src-123"
    assert request.source_type == "web"
