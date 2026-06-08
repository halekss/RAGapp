"""
Collecteur RSS.

Lit un flux RSS/Atom et retourne une liste de CollectedDocument.
Chaque entrée du flux devient un document indépendant.

Dépendances : feedparser, httpx
"""

import logging
from datetime import datetime, timezone

import feedparser
import httpx

from .base import CollectedDocument, SourceType

logger = logging.getLogger(__name__)


def collect(source_config: dict, client_id: str) -> list[CollectedDocument]:
    """
    Collecte tous les articles d'un flux RSS.

    `source_config` est le bloc YAML de la source, par exemple :

        type: rss
        url: https://example.com/feed.xml
        max_items: 20          # optionnel, défaut 50
        min_content_length: 100  # optionnel : ignore les entrées trop courtes

    Retourne une liste (potentiellement vide) de CollectedDocument.
    """
    url: str = source_config["url"]
    max_items: int = source_config.get("max_items", 50)
    min_length: int = source_config.get("min_content_length", 50)

    logger.info(f"[RSS] Collecte de {url} pour le client {client_id}")

    try:
        raw_feed = _fetch_feed(url)
    except Exception as exc:
        logger.error(f"[RSS] Impossible de récupérer {url} : {exc}")
        return []

    documents: list[CollectedDocument] = []

    for entry in raw_feed.entries[:max_items]:
        doc = _parse_entry(entry, client_id)
        if doc is None:
            continue
        if len(doc.content) < min_length:
            logger.debug(f"[RSS] Entrée ignorée (contenu trop court) : {doc.url}")
            continue
        documents.append(doc)

    logger.info(f"[RSS] {len(documents)} documents collectés depuis {url}")
    return documents


# ---------------------------------------------------------------------------
# Fonctions internes
# ---------------------------------------------------------------------------

def _fetch_feed(url: str) -> feedparser.FeedParserDict:
    """
    Télécharge le flux RSS via httpx puis le parse avec feedparser.
    On passe par httpx plutôt que feedparser.parse(url) directement
    pour mieux contrôler le timeout et les headers.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; CompetitiveRAG/1.0; +https://github.com/)"
        )
    }
    with httpx.Client(timeout=15, follow_redirects=True) as client:
        response = client.get(url, headers=headers)
        response.raise_for_status()

    return feedparser.parse(response.text)


def _parse_entry(entry: feedparser.FeedParserDict, client_id: str) -> CollectedDocument | None:
    """
    Convertit une entrée feedparser en CollectedDocument.
    Retourne None si l'entrée est inexploitable (pas d'URL, pas de contenu).
    """
    url: str = entry.get("link", "").strip()
    if not url:
        return None

    title: str = entry.get("title", "Sans titre").strip()

    # feedparser expose le contenu sous plusieurs champs selon les flux
    content: str = _extract_content(entry)
    if not content:
        return None

    published_at: datetime | None = _parse_date(entry)

    author: str | None = entry.get("author", None)

    return CollectedDocument(
        content=content,
        url=url,
        title=title,
        source_type=SourceType.RSS,
        client_id=client_id,
        published_at=published_at,
        author=author,
    )


def _extract_content(entry: feedparser.FeedParserDict) -> str:
    """
    Extrait le texte le plus complet possible depuis une entrée RSS.
    Ordre de priorité : content > summary > title seul.
    On ne fait pas de parsing HTML ici : le chunker s'en chargera.
    """
    # Certains flux mettent le contenu complet dans `content`
    if content_list := entry.get("content"):
        return content_list[0].get("value", "").strip()

    # La plupart des flux ont au moins un `summary`
    if summary := entry.get("summary", "").strip():
        return summary

    return ""


def _parse_date(entry: feedparser.FeedParserDict) -> datetime | None:
    """
    Retourne la date de publication en datetime UTC, ou None si absente/invalide.
    feedparser expose `published_parsed` (struct_time) quand il arrive à parser la date.
    """
    if struct := entry.get("published_parsed"):
        try:
            return datetime(*struct[:6], tzinfo=timezone.utc)
        except Exception:
            pass
    return None