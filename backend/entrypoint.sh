#!/usr/bin/env bash
# =============================================================================
# entrypoint.sh — Lance la migration Alembic puis démarre l'application
# À placer dans : backend/entrypoint.sh
# =============================================================================
set -e

echo "[entrypoint] Attente de PostgreSQL..."

# Attendre que PostgreSQL soit prêt avant de migrer
until python - <<'EOF'
import asyncio, sys
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import get_settings

async def check():
    engine = create_async_engine(get_settings().database_url)
    try:
        async with engine.connect():
            pass
        await engine.dispose()
    except Exception as e:
        sys.exit(1)

asyncio.run(check())
EOF
do
  echo "[entrypoint] PostgreSQL pas encore prêt, nouvelle tentative dans 2s..."
  sleep 2
done

echo "[entrypoint] PostgreSQL prêt. Application des migrations Alembic..."
alembic upgrade head
echo "[entrypoint] Migrations appliquées."

# Démarrer la commande passée en argument (api ou worker ou beat)
exec "$@"