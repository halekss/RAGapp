"""
Collecteurs de sources.

Chaque module expose une fonction `collect(source_config, client_id)`
qui retourne une liste de CollectedDocument.

Usage depuis le pipeline :

    from app.ingestion.collectors import rss, scraper, pdf
    from app.ingestion.collectors.base import SourceType

    docs = rss.collect(source_config, client_id)
    docs = await scraper.collect(source_config, client_id)  # async
    docs = pdf.collect(source_config, client_id)
"""

from .base import CollectedDocument, SourceType

__all__ = ["CollectedDocument", "SourceType"]