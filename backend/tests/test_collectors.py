import pytest
from app.collectors.rss import collect_rss


@pytest.mark.asyncio
async def test_collect_rss_invalid_url():
    """Test avec URL invalide."""
    articles = await collect_rss("https://invalid-url-12345.fake/rss")
    # Doit retourner une liste vide ou lever une exception
    assert isinstance(articles, list)
