# Competitive RAG

Assistant de veille concurrentielle par RAG — multi-tenant, configurable par fichier YAML, zéro donnée fictive codée en dur.

## Stack

| Couche | Technologie |
|---|---|
| API | FastAPI + Uvicorn (Python 3.11) |
| Tâches async | Celery + Redis |
| Base vectorielle | Qdrant |
| Base relationnelle | PostgreSQL 16 |
| Pipeline RAG | LlamaIndex |
| LLM / Embedding | LM Studio (local) ou OpenAI (configurable) |
| Frontend | React 18 + Vite + Tailwind |
| Infrastructure | Docker Compose |

---

## Prérequis

- Docker Desktop
- Python 3.11
- Node.js 20+
- LM Studio avec les modèles suivants installés et le serveur démarré sur le port `1234` :

| Rôle | Modèle |
|---|---|
| Génération | `meta-llama-3.1-8b-instruct` |
| Embedding | `nomic-ai/nomic-embed-text-v1.5` |

Le **Just-in-Time Model Loading** doit être activé dans LM Studio (onglet Developer) pour que les deux modèles soient disponibles sur le même port.

---

## Démarrage rapide

```bash
# 1. Copier et remplir les variables d'environnement
cp .env.example .env

# 2. Générer les dépendances npm (première fois uniquement)
cd frontend && npm install && cd ..

# 3. Lancer le stack complet
docker compose up --build   # premier lancement
docker compose up           # relances suivantes
```

### URLs disponibles

| URL | Service |
|---|---|
| http://localhost:8000/health | Healthcheck API |
| http://localhost:8000/docs | Swagger UI (APP_ENV=development) |
| http://localhost:3000 | Frontend React |
| http://localhost:6333/dashboard | Interface Qdrant |

---

## Commandes courantes

```bash
# Arrêter le stack (volumes conservés)
docker compose down

# Arrêter et supprimer les volumes (reset complet de la BDD)
docker compose down -v

# Suivre les logs d'un service
docker compose logs -f api
docker compose logs -f worker

# Rebuilder uniquement après modification de fichiers Python ou Docker
docker compose up --build
```

---

## Environnement de développement backend (IDE + tests)

Le venv sert uniquement pour l'autocomplétion VS Code et les tests unitaires. L'application tourne dans Docker.

```bash
cd backend

# Créer le venv
py -3.11 -m venv .venv          # Windows
python3.11 -m venv .venv        # macOS / Linux

# Activer le venv
source .venv/Scripts/activate   # Windows (Git Bash)
source .venv/bin/activate       # macOS / Linux

# Installer les dépendances
python.exe -m pip install --upgrade pip   # Windows
pip install -e ".[dev]"
```

Dans VS Code : `Ctrl+Shift+P` > `Python: Select Interpreter` > choisir `.venv\Scripts\python.exe`.

---

## Ajouter un client

```bash
cp -r backend/configs/_template backend/configs/mon-client
# Éditer backend/configs/mon-client/config.yaml
docker compose up   # pas de rebuild nécessaire, les configs sont montées en volume
```

Aucune modification de code nécessaire. Chaque client dispose de son namespace Qdrant isolé, sa clé API et sa configuration de sources.

---

## Basculer sur OpenAI

Modifier deux lignes dans le `.env` :

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Puis `docker compose up --build`.

---

## Structure

```
competitive-rag/
├── .env                        # Variables d'environnement (non commité)
├── .env.example                # Template
├── docker-compose.yml
├── docker-compose.dev.yml      # Surcharge dev (hot-reload + Flower)
├── PROJECT_CONTEXT.md          # Contexte complet du projet pour IA
│
├── backend/
│   ├── app/
│   │   ├── main.py             # Point d'entrée FastAPI
│   │   ├── api/routes/         # Endpoints (chat, sources, ingestion, clients)
│   │   ├── core/               # Config, database, logging, sécurité
│   │   ├── ingestion/          # Collecteurs RSS, scraping, PDF + pipeline
│   │   ├── rag/                # Retriever, generator, chain
│   │   ├── models/             # SQLAlchemy : Client, Source, QueryLog
│   │   └── services/           # LLM factory, Celery, Qdrant
│   ├── configs/                # Un dossier YAML par client
│   ├── alembic/                # Migrations base de données
│   └── pyproject.toml
│
└── frontend/
    └── src/
        ├── pages/              # Chat, Dashboard, Admin
        ├── components/         # chat/, dashboard/, admin/
        ├── api/                # Clients HTTP typés
        └── hooks/              # React Query hooks
```

---

## État du projet

### Terminé
- Stack Docker complet opérationnel (tous services healthy)
- Configuration multi-tenant par fichier YAML
- Authentification par API Key
- Modèles SQLAlchemy (Client, Source, QueryLog)
- Factory LLM/Embedding switchable LM Studio / OpenAI
- Celery + beat schedule configurés
- Frontend React initialisé avec routing

### À venir
- Pipeline d'ingestion (RSS, scraping, PDF, chunking, embedding)
- Pipeline RAG (retriever, generator)
- Routes API (chat, sources, ingestion, clients)
- Interface React (composants chat, dashboard, admin)
- Tests unitaires
- Migration Alembic initiale