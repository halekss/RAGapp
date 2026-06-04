import feedparser
from datetime import datetime


async def collect_rss(url: str, keywords: list[str] = []) -> list[dict]:
    """Collecte les articles d'un flux RSS avec filtrage optionnel par mots-clés."""
    feed = feedparser.parse(url)
    articles = []

    for entry in feed.entries:
        text = f"{entry.get('title', '')} {entry.get('summary', '')}"

        if keywords and not any(kw.lower() in text.lower() for kw in keywords):
            continue

        articles.append({
            "title": entry.get("title", ""),
            "url": entry.get("link", ""),
            "content": entry.get("summary", ""),
            "published_at": entry.get("published", datetime.utcnow().isoformat()),
            "source_url": url,
        })

    return articles
