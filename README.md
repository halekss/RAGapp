# Competitive RAG

Assistant de veille concurrentielle par RAG — multi-tenant, configurable par fichier YAML, zéro donnée fictive codée en dur.

## Stack

| Couche | Technologie |
|---|---|
| API | FastAPI + Uvicorn |
| Tâches async | Celery + Redis |
| Base vectorielle | Qdrant |
| Base relationnelle | PostgreSQL |
| Pipeline RAG | LlamaIndex |
| Frontend | React 18 + Vite + Tailwind |
| Infrastructure | Docker Compose |

## Démarrage rapide

```bash
# 1. Copier et remplir les variables d'environnement
cp .env.example .env

# 2. Lancer l'environnement de développement
docker compose -f docker-compose.dev.yml up --build

# 3. L'API est disponible sur http://localhost:8000
#    La doc Swagger est sur http://localhost:8000/docs
#    Le frontend est sur http://localhost:3000
#    Flower (monitoring Celery) est sur http://localhost:5555
```

## Ajouter un client

```bash
cp -r backend/configs/_template backend/configs/mon-client
# Éditer backend/configs/mon-client/config.yaml
# Redémarrer le service api et worker
```

Aucune modification de code nécessaire.

## Structure

```
competitive-rag/
├── backend/
│   ├── app/
│   │   ├── api/routes/     # Endpoints FastAPI
│   │   ├── core/           # Config, logging, sécurité
│   │   ├── ingestion/      # Collecteurs de sources
│   │   ├── rag/            # Pipeline retrieval + génération
│   │   ├── models/         # Modèles SQLAlchemy
│   │   └── services/       # Qdrant, Celery
│   └── configs/            # Un dossier YAML par client
└── frontend/
    └── src/
        ├── components/
        ├── pages/
        ├── api/
        └── hooks/
```