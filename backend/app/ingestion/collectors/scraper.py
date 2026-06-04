"""
Collecteur Scraping (Playwright).

Visite une ou plusieurs URLs, attend le rendu JavaScript complet,
extrait le contenu textuel principal et retourne des CollectedDocument.

Dépendances : playwright (chromium), beautifulsoup4
Le navigateur Chromium est installé dans le Dockerfile backend via :
    RUN playwright install chromium --with-deps
"""

import logging

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

from .base import CollectedDocument, SourceType

logger = logging.getLogger(__name__)

# Sélecteurs CSS à essayer pour trouver le contenu principal de la page,
# dans l'ordre de priorité. On s'arrête dès qu'un sélecteur donne du texte.
_CONTENT_SELECTORS = [
    "article",
    "main",
    '[role="main"]',
    ".post-content",
    ".article-body",
    ".entry-content",
    "#content",
]

# Éléments à supprimer avant extraction (navigation, pub, pied de page…)
_NOISE_SELECTORS = [
    "nav", "header", "footer", "aside",
    ".cookie-banner", ".newsletter-signup",
    ".social-share", ".related-articles",
    "script", "style", "noscript",
]


async def collect(source_config: dict, client_id: str) -> list[CollectedDocument]:
    """
    Collecte le contenu d'une ou plusieurs URLs par scraping.

    `source_config` est le bloc YAML de la source, par exemple :

        type: scraping
        urls:
          - https://example.com/newsroom
          - https://example.com/blog
        wait_for_selector: ".article-list"   # optionnel : attendre un élément JS
        timeout_ms: 15000                    # optionnel, défaut 15 000 ms
        min_content_length: 200              # optionnel

    Retourne une liste de CollectedDocument (un par URL visitée avec succès).
    """
    urls: list[str] = source_config.get("urls", [])
    if not urls:
        logger.warning(f"[SCRAPING] Aucune URL configurée pour le client {client_id}")
        return []

    wait_for: str | None = source_config.get("wait_for_selector")
    timeout_ms: int = source_config.get("timeout_ms", 15_000)
    min_length: int = source_config.get("min_content_length", 200)

    documents: list[CollectedDocument] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )

        for url in urls:
            doc = await _scrape_url(
                context, url, client_id, wait_for, timeout_ms, min_length
            )
            if doc is not None:
                documents.append(doc)

        await browser.close()

    logger.info(
        f"[SCRAPING] {len(documents)}/{len(urls)} pages collectées "
        f"pour le client {client_id}"
    )
    return documents


# ---------------------------------------------------------------------------
# Fonctions internes
# ---------------------------------------------------------------------------

async def _scrape_url(
    context,
    url: str,
    client_id: str,
    wait_for: str | None,
    timeout_ms: int,
    min_length: int,
) -> CollectedDocument | None:
    """
    Visite une URL, attend le rendu JS, extrait le contenu principal.
    Retourne None en cas d'échec ou si le contenu est trop court.
    """
    logger.info(f"[SCRAPING] Visite de {url}")
    page = await context.new_page()

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)

        # Si la page a du contenu chargé en JS, on attend un sélecteur spécifique
        if wait_for:
            try:
                await page.wait_for_selector(wait_for, timeout=timeout_ms)
            except Exception:
                logger.warning(
                    f"[SCRAPING] Sélecteur '{wait_for}' non trouvé sur {url}, "
                    f"on continue quand même"
                )

        html = await page.content()
        title = await page.title()

    except Exception as exc:
        logger.error(f"[SCRAPING] Erreur sur {url} : {exc}")
        return None
    finally:
        await page.close()

    content = _extract_main_content(html)

    if len(content) < min_length:
        logger.debug(
            f"[SCRAPING] Contenu trop court ({len(content)} chars) sur {url}, ignoré"
        )
        return None

    return CollectedDocument(
        content=content,
        url=url,
        title=title or url,
        source_type=SourceType.SCRAPING,
        client_id=client_id,
    )


def _extract_main_content(html: str) -> str:
    """
    Extrait le texte principal d'une page HTML.

    1. Supprime les éléments parasites (nav, footer, scripts…)
    2. Essaie les sélecteurs de contenu connus dans l'ordre
    3. Retombe sur le <body> entier si aucun sélecteur ne matche
    """
    soup = BeautifulSoup(html, "html.parser")

    # Supprimer les éléments parasites
    for selector in _NOISE_SELECTORS:
        for tag in soup.select(selector):
            tag.decompose()

    # Chercher un bloc de contenu principal
    for selector in _CONTENT_SELECTORS:
        element = soup.select_one(selector)
        if element:
            text = element.get_text(separator="\n", strip=True)
            if len(text) > 100:
                return text

    # Fallback sur le body complet
    body = soup.find("body")
    if body:
        return body.get_text(separator="\n", strip=True)

    return soup.get_text(separator="\n", strip=True)