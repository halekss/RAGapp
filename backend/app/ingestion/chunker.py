"""
Chunker.

Prend un CollectedDocument et le découpe en une liste de TextChunk,
prêts à être envoyés à l'embedder.

Stratégie de découpe (dans l'ordre) :
1. On coupe aux séparateurs naturels du texte (titres, paragraphes, sauts de ligne)
2. Si un bloc est encore trop long après ça, on le découpe par taille fixe en mots
3. On applique un chevauchement (overlap) entre chunks consécutifs

Toute la configuration se fait via le YAML client, avec des valeurs par défaut
raisonnables si rien n'est précisé.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime

from .collectors.base import CollectedDocument, SourceType

logger = logging.getLogger(__name__)

# Valeurs par défaut (surchargeable dans le YAML client)
DEFAULT_CHUNK_SIZE = 300        # mots par chunk
DEFAULT_CHUNK_OVERLAP = 50      # mots répétés à cheval entre deux chunks
DEFAULT_MIN_CHUNK_SIZE = 30     # en dessous, un chunk est trop petit pour être utile

# Séparateurs structurels, du plus fort au plus faible
# On essaie de couper en priorité aux titres Markdown, puis aux paragraphes,
# puis aux simples sauts de ligne.
_STRUCTURAL_SEPARATORS = [
    r"\n#{1,6}\s",   # Titres Markdown (# Titre, ## Sous-titre…)
    r"\n\n+",        # Paragraphes (double saut de ligne)
    r"\n",           # Saut de ligne simple
]


@dataclass
class TextChunk:
    """
    Morceau de texte prêt à être embedé.

    Contient le texte lui-même + toutes les métadonnées nécessaires
    pour retrouver l'origine du chunk après une recherche dans Qdrant.
    """
    content: str
    client_id: str
    source_url: str
    source_title: str
    source_type: SourceType
    chunk_index: int            # Position du chunk dans le document (0, 1, 2…)
    total_chunks: int           # Nombre total de chunks du document
    collected_at: datetime = field(default_factory=datetime.utcnow)
    extra: dict = field(default_factory=dict)

    def word_count(self) -> int:
        return len(self.content.split())


def chunk_document(document: CollectedDocument, chunker_config: dict) -> list[TextChunk]:
    """
    Découpe un CollectedDocument en une liste de TextChunk.

    `chunker_config` vient du YAML client, par exemple :

        chunker:
          chunk_size: 300        # mots par chunk (défaut : 300)
          chunk_overlap: 50      # mots de chevauchement (défaut : 50)
          min_chunk_size: 30     # taille minimale pour garder un chunk (défaut : 30)

    Retourne une liste vide si le document n'a pas de contenu exploitable.
    """
    chunk_size: int = chunker_config.get("chunk_size", DEFAULT_CHUNK_SIZE)
    chunk_overlap: int = chunker_config.get("chunk_overlap", DEFAULT_CHUNK_OVERLAP)
    min_chunk_size: int = chunker_config.get("min_chunk_size", DEFAULT_MIN_CHUNK_SIZE)

    # Sécurité : l'overlap ne peut pas être plus grand que la moitié du chunk
    chunk_overlap = min(chunk_overlap, chunk_size // 2)

    if not document.content.strip():
        logger.warning(f"[CHUNKER] Document vide ignoré : {document.url}")
        return []

    # Étape 1 : découpe structurelle
    blocks = _split_by_structure(document.content)

    # Étape 2 : découpe par taille fixe si un bloc est encore trop long
    word_blocks = _split_oversized_blocks(blocks, chunk_size)

    # Étape 3 : fusion des blocs trop courts avec leurs voisins
    merged_blocks = _merge_small_blocks(word_blocks, min_chunk_size, chunk_size)

    # Étape 4 : application du chevauchement
    final_texts = _apply_overlap(merged_blocks, chunk_overlap)

    # Étape 5 : filtrage des chunks trop courts et construction des TextChunk
    chunks = []
    total = len(final_texts)

    for i, text in enumerate(final_texts):
        if len(text.split()) < min_chunk_size:
            logger.debug(f"[CHUNKER] Chunk {i} trop court, ignoré ({len(text.split())} mots)")
            continue

        chunks.append(
            TextChunk(
                content=text.strip(),
                client_id=document.client_id,
                source_url=document.url,
                source_title=document.title,
                source_type=document.source_type,
                chunk_index=i,
                total_chunks=total,
                extra=document.extra,
            )
        )

    logger.info(
        f"[CHUNKER] {len(chunks)} chunks produits depuis '{document.title}' "
        f"({document.url})"
    )
    return chunks


def chunk_documents(
    documents: list[CollectedDocument], chunker_config: dict
) -> list[TextChunk]:
    """
    Commodité : découpe une liste de documents d'un seul appel.
    """
    all_chunks = []
    for doc in documents:
        all_chunks.extend(chunk_document(doc, chunker_config))
    return all_chunks


# ---------------------------------------------------------------------------
# Fonctions internes
# ---------------------------------------------------------------------------

def _split_by_structure(text: str) -> list[str]:
    """
    Coupe le texte aux séparateurs structurels (titres, paragraphes, sauts de ligne).
    Retourne une liste de blocs non vides.
    """
    # On construit un pattern combiné : on coupe à chaque séparateur structurel
    combined_pattern = "|".join(_STRUCTURAL_SEPARATORS)
    blocks = re.split(combined_pattern, text)
    return [b.strip() for b in blocks if b.strip()]


def _split_oversized_blocks(blocks: list[str], chunk_size: int) -> list[list[str]]:
    """
    Pour chaque bloc, retourne une liste de listes de mots.
    Si un bloc dépasse chunk_size mots, il est redécoupé par taille fixe.
    """
    result = []
    for block in blocks:
        words = block.split()
        if len(words) <= chunk_size:
            result.append(words)
        else:
            # Découpe par taille fixe, sans overlap à cette étape
            for start in range(0, len(words), chunk_size):
                result.append(words[start: start + chunk_size])
    return result


def _merge_small_blocks(
    word_blocks: list[list[str]], min_size: int, max_size: int
) -> list[list[str]]:
    """
    Fusionne les blocs trop courts avec le bloc précédent,
    dans la limite de max_size mots.

    Ex : un bloc de 10 mots + un bloc de 15 mots = un bloc de 25 mots,
    plutôt que deux micro-chunks inutiles.
    """
    if not word_blocks:
        return []

    merged = [word_blocks[0][:]]

    for block in word_blocks[1:]:
        current = merged[-1]
        if len(block) < min_size and len(current) + len(block) <= max_size:
            current.extend(block)
        else:
            merged.append(block[:])

    return merged


def _apply_overlap(word_blocks: list[list[str]], overlap: int) -> list[str]:
    """
    Reconstitue des chaînes de texte depuis les listes de mots,
    en ajoutant les `overlap` derniers mots du chunk précédent
    au début de chaque chunk suivant.

    Exemple avec overlap=3, chunks ["le chat dort", "sur le tapis"] :
    → ["le chat dort", "dort sur le tapis"]
    """
    if not word_blocks:
        return []

    texts = []
    for i, words in enumerate(word_blocks):
        if i == 0 or overlap == 0:
            texts.append(" ".join(words))
        else:
            tail = word_blocks[i - 1][-overlap:]
            texts.append(" ".join(tail + words))

    return texts