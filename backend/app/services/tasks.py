"""
Tâches Celery asynchrones.
"""
import logging
import asyncio
from app.services.scheduler import celery_app
from app.collectors.rss import collect_rss
from app.collectors.scraper import scrape_page
from app.collectors.pdf import collect_pdf
from app.pipeline import ingest

logger = logging.getLogger(__name__)


@celery_app.task(name="app.services.tasks.check_scheduled_sources")
def check_scheduled_sources() -> dict[str, str]:
    """
    Vérifie toutes les sources dont le schedule est échu et lance leur ingestion.
    """
    logger.info("Vérification des sources planifiées")
    # TODO: récupérer les sources avec schedule depuis la DB
    # TODO: lancer ingest_source pour chacune
    return {"status": "ok"}


@celery_app.task(name="app.services.tasks.ingest_source", bind=True, max_retries=3)
def ingest_source(self, source_id: str, url: str, source_type: str) -> dict[str, str]:
    """
    Ingère une source spécifique : collecte → chunking → embedding → Qdrant.
    """
    try:
        logger.info(f"Ingestion source {source_id} ({source_type})")
        
        # Collecte selon le type
        async def collect():
            if source_type == "rss":
                articles = await collect_rss(url)
                for article in articles:
                    await ingest(source_id, article["url"], article["content"])
            elif source_type == "web":
                page = await scrape_page(url)
                await ingest(source_id, url, page["content"])
            elif source_type == "pdf":
                pdf = await collect_pdf(url)
                await ingest(source_id, url, pdf["content"])
        
        asyncio.run(collect())
        logger.info(f"Ingestion réussie pour {source_id}")
        return {"status": "success", "source_id": source_id}
    
    except Exception as exc:
        logger.error(f"Erreur ingestion {source_id}: {exc}")
        raise self.retry(exc=exc, countdown=60)
