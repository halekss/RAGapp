import asyncio
import sys
sys.path.insert(0, '.')

from app.collectors.rss import collect_rss
from app.collectors.scraper import scrape_page
from app.chunker import chunk_text
from app.embedder import embed_texts
from app.pipeline import ingest


async def test_imports():
    """Vérifie que tous les modules s'importent correctement."""
    print("✓ Tous les modules importés avec succès")


async def test_chunker():
    """Teste le chunker."""
    text = "Ceci est un texte de test. " * 100
    chunks = chunk_text(text, chunk_size=50, overlap=10)
    print(f"✓ Chunker fonctionne : {len(chunks)} chunks créés")
    print(f"  Premier chunk (100 chars) : {chunks[0][:100]}...")


async def test_rss():
    """Teste la collecte RSS (exemple avec un vrai flux)."""
    try:
        articles = await collect_rss("https://feeds.techcrunch.com/", keywords=["AI"])
        print(f"✓ RSS collecte fonctionne : {len(articles)} articles trouvés")
        if articles:
            print(f"  Exemple : {articles[0]['title'][:60]}...")
    except Exception as e:
        print(f"⚠ RSS test échoué (normal si pas de connexion) : {e}")


async def test_scraper():
    """Teste le scraper (exemple avec une URL simple)."""
    try:
        result = await scrape_page("https://example.com")
        print(f"✓ Scraper fonctionne : titre='{result['title']}'")
        print(f"  Contenu (100 chars) : {result['content'][:100]}...")
    except Exception as e:
        print(f"⚠ Scraper test échoué (normal si pas de Playwright) : {e}")


async def test_embedder():
    """Teste l'embedder (nécessite LM Studio sur port 1234)."""
    try:
        embeddings = await embed_texts(["Bonjour", "Au revoir"])
        print(f"✓ Embedder fonctionne : {len(embeddings)} embeddings générés")
        print(f"  Dimensions : {len(embeddings[0])} dims")
    except Exception as e:
        print(f"⚠ Embedder test échoué (LM Studio doit tourner sur 1234) : {e}")


async def main():
    print("=== Test du Pipeline RAG ===\n")
    
    await test_imports()
    await test_chunker()
    await test_rss()
    await test_scraper()
    await test_embedder()
    
    print("\n=== Tests terminés ===")


if __name__ == "__main__":
    asyncio.run(main())
