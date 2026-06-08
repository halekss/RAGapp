"""
Convention commune pour tous les collecteurs.

Chaque collecteur doit exposer une méthode `collect(source_config, client_id)`
qui retourne une liste de CollectedDocument.

On n'utilise pas de classe abstraite Python : la convention est documentée ici
et c'est à nous de la respecter dans chaque collecteur.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class SourceType(str, Enum):
    RSS = "rss"
    SCRAPING = "scraping"
    PDF = "pdf"


@dataclass
class CollectedDocument:
    """
    Document brut retourné par n'importe quel collecteur.

    C'est l'unité d'échange entre les collecteurs et le pipeline
    (chunking + embedding). Peu importe d'où vient le document
    (flux RSS, page web ou PDF), il finit toujours sous cette forme.
    """

    # Contenu textuel extrait de la source
    content: str

    # Métadonnées
    url: str
    title: str
    source_type: SourceType
    client_id: str

    # Optionnels
    published_at: datetime | None = None
    author: str | None = None
    extra: dict = field(default_factory=dict)

    def is_valid(self) -> bool:
        """Un document est valide s'il a du contenu et une URL."""
        return bool(self.content.strip()) and bool(self.url.strip())