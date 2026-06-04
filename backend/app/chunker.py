def chunk_text(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """Découpe un texte en chunks chevauchés."""
    words = text.split()
    if not words:
        return []
    
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
        # S'assurer qu'on avance d'au moins 1 mot
        i += max(1, chunk_size - overlap)
    
    return [c for c in chunks if c.strip()]
