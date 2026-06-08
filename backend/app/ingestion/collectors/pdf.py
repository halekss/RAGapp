"""
Collecteur PDF.

Lit des fichiers PDF depuis le système de fichiers local (dossier uploads du client)
ou depuis une URL directe, et retourne des CollectedDocument.

Dépendances : pypdf, httpx
"""

import logging
from pathlib import Path

import httpx
from pypdf import PdfReader

from .base import CollectedDocument, SourceType

logger = logging.getLogger(__name__)


def collect(source_config: dict, client_id: str) -> list[CollectedDocument]:
    """
    Collecte le contenu de fichiers PDF.

    `source_config` accepte deux modes, configurables dans le YAML :

    Mode 1 — dossier local (PDFs déposés par l'utilisateur) :
        type: pdf
        folder: /app/uploads/mon-client/pdfs
        min_content_length: 100

    Mode 2 — URLs directes vers des PDFs (ex : rapports annuels) :
        type: pdf
        urls:
          - https://example.com/rapport-annuel-2024.pdf
          - https://example.com/brochure.pdf
        min_content_length: 100

    Les deux modes peuvent coexister dans la même config.
    """
    min_length: int = source_config.get("min_content_length", 100)
    documents: list[CollectedDocument] = []

    # Mode dossier local
    if folder_path := source_config.get("folder"):
        folder_docs = _collect_from_folder(folder_path, client_id, min_length)
        documents.extend(folder_docs)

    # Mode URLs
    if urls := source_config.get("urls", []):
        url_docs = _collect_from_urls(urls, client_id, min_length)
        documents.extend(url_docs)

    if not documents:
        logger.warning(
            f"[PDF] Aucun document collecté pour le client {client_id}. "
            f"Vérifier la config (folder ou urls)."
        )

    logger.info(f"[PDF] {len(documents)} documents collectés pour {client_id}")
    return documents


# ---------------------------------------------------------------------------
# Fonctions internes
# ---------------------------------------------------------------------------

def _collect_from_folder(
    folder_path: str, client_id: str, min_length: int
) -> list[CollectedDocument]:
    """
    Parcourt un dossier et extrait le texte de tous les PDF trouvés.
    Les sous-dossiers sont ignorés.
    """
    folder = Path(folder_path)
    if not folder.exists():
        logger.error(f"[PDF] Dossier introuvable : {folder_path}")
        return []

    documents = []
    pdf_files = sorted(folder.glob("*.pdf"))

    if not pdf_files:
        logger.info(f"[PDF] Aucun fichier PDF dans {folder_path}")
        return []

    for pdf_file in pdf_files:
        doc = _extract_from_path(pdf_file, client_id, min_length)
        if doc is not None:
            documents.append(doc)

    return documents


def _collect_from_urls(
    urls: list[str], client_id: str, min_length: int
) -> list[CollectedDocument]:
    """
    Télécharge chaque PDF depuis son URL puis en extrait le texte.
    """
    documents = []

    for url in urls:
        logger.info(f"[PDF] Téléchargement de {url}")
        try:
            pdf_bytes = _download_pdf(url)
            content, page_count = _extract_text_from_bytes(pdf_bytes)
        except Exception as exc:
            logger.error(f"[PDF] Erreur sur {url} : {exc}")
            continue

        if len(content) < min_length:
            logger.debug(f"[PDF] Contenu trop court sur {url}, ignoré")
            continue

        # On déduit un titre approximatif depuis l'URL
        title = url.rstrip("/").split("/")[-1].replace("-", " ").replace("_", " ")

        documents.append(
            CollectedDocument(
                content=content,
                url=url,
                title=title,
                source_type=SourceType.PDF,
                client_id=client_id,
                extra={"page_count": page_count},
            )
        )

    return documents


def _extract_from_path(
    pdf_path: Path, client_id: str, min_length: int
) -> CollectedDocument | None:
    """
    Extrait le texte d'un fichier PDF local.
    """
    logger.info(f"[PDF] Lecture de {pdf_path.name}")
    try:
        with open(pdf_path, "rb") as f:
            content, page_count = _extract_text_from_bytes(f.read())
    except Exception as exc:
        logger.error(f"[PDF] Impossible de lire {pdf_path} : {exc}")
        return None

    if len(content) < min_length:
        logger.debug(f"[PDF] Contenu trop court dans {pdf_path.name}, ignoré")
        return None

    return CollectedDocument(
        content=content,
        url=str(pdf_path.resolve()),
        title=pdf_path.stem.replace("-", " ").replace("_", " "),
        source_type=SourceType.PDF,
        client_id=client_id,
        extra={"page_count": page_count, "filename": pdf_path.name},
    )


def _extract_text_from_bytes(pdf_bytes: bytes) -> tuple[str, int]:
    """
    Extrait le texte de tous les pages d'un PDF en mémoire.
    Retourne (texte_complet, nombre_de_pages).

    Note : pypdf ne gère pas les PDFs scannés (images sans couche texte).
    Pour cela il faudrait ajouter OCR (tesseract) dans une itération future.
    """
    import io
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages_text = []

    for page_num, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
            if text.strip():
                pages_text.append(f"[Page {page_num}]\n{text.strip()}")
        except Exception as exc:
            logger.warning(f"[PDF] Erreur d'extraction page {page_num} : {exc}")

    return "\n\n".join(pages_text), len(reader.pages)


def _download_pdf(url: str) -> bytes:
    """
    Télécharge un PDF depuis une URL et retourne ses octets bruts.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; CompetitiveRAG/1.0; +https://github.com/)"
        )
    }
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        response = client.get(url, headers=headers)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")
        if "pdf" not in content_type and not url.lower().endswith(".pdf"):
            logger.warning(
                f"[PDF] L'URL {url} ne semble pas pointer vers un PDF "
                f"(Content-Type: {content_type})"
            )

    return response.content