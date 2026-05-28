"""
Configuration du logging structuré.
En développement : format lisible. En production : JSON pour les agrégateurs de logs.
"""
import logging
import sys
from typing import Any

from app.core.config import get_settings


def setup_logging() -> None:
    settings = get_settings()

    log_level = logging.DEBUG if settings.is_dev else logging.INFO

    handler = logging.StreamHandler(sys.stdout)

    if settings.is_dev:
        fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
        handler.setFormatter(logging.Formatter(fmt, datefmt="%H:%M:%S"))
    else:
        # Format JSON minimal sans dépendance supplémentaire
        class JsonFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                import json
                payload: dict[str, Any] = {
                    "level": record.levelname,
                    "logger": record.name,
                    "message": record.getMessage(),
                }
                if record.exc_info:
                    payload["exc_info"] = self.formatException(record.exc_info)
                return json.dumps(payload)

        handler.setFormatter(JsonFormatter())

    logging.basicConfig(level=log_level, handlers=[handler])

    # Réduire le bruit des libs tierces
    for noisy_lib in ("httpx", "httpcore", "uvicorn.access"):
        logging.getLogger(noisy_lib).setLevel(logging.WARNING)