import pdfplumber
import httpx
import tempfile
import os


async def collect_pdf(url: str) -> dict:
    """Télécharge et extrait le texte d'un PDF."""
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=30)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(response.content)
        tmp_path = f.name

    text = ""
    with pdfplumber.open(tmp_path) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""

    os.unlink(tmp_path)

    return {
        "url": url,
        "content": text,
    }
