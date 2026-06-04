import pytest
from app.api.routes.sources import router, SourceCreate


def test_sources_router_exists():
    assert router is not None
    assert router.prefix == "/sources"


def test_source_create_model():
    source = SourceCreate(
        client_id="client-1",
        url="https://example.com",
        source_type="rss"
    )
    assert source.client_id == "client-1"
    assert source.url == "https://example.com"
    assert source.source_type == "rss"
