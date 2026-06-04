import pytest
from app.chunker import chunk_text


def test_chunk_text_basic():
    """Test que chunk_text divise le texte."""
    text = "Ceci est un texte de test. " * 50
    chunks = chunk_text(text, chunk_size=50, overlap=10)
    assert len(chunks) > 1
    assert all(isinstance(c, str) for c in chunks)


def test_chunk_text_empty():
    """Test avec texte vide."""
    chunks = chunk_text("", chunk_size=50)
    assert len(chunks) == 0


def test_chunk_text_small():
    """Test avec texte plus petit que chunk_size."""
    text = "Court texte"
    chunks = chunk_text(text, chunk_size=50, overlap=0)  # overlap=0 pour éviter duplication
    assert len(chunks) == 1
    assert chunks[0] == text
