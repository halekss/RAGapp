FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier uniquement les fichiers de dépendances en premier (cache Docker)
COPY pyproject.toml .

# Créer le dossier app vide pour que hatchling trouve le package
RUN mkdir -p app && touch app/__init__.py

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e .

# Installer Playwright et ses navigateurs pour le scraping
RUN playwright install chromium --with-deps

# Copier le reste du code source
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]