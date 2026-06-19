# Competitive RAG

Assistant de veille concurrentielle par RAG — multi-tenant, configurable par fichier YAML, zéro donnée fictive codée en dur.

---

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

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Python 3.11 (uniquement pour travailler sur le code backend hors Docker)
- LM Studio avec les modèles suivants installés et le serveur démarré sur le port `1234` :

| Rôle | Modèle |
|---|---|
| Génération | `meta-llama-3.1-8b-instruct` |
| Embedding | `nomic-ai/nomic-embed-text-v1.5` |

Le **Just-in-Time Model Loading** doit être activé dans LM Studio (onglet Developer) pour que les deux modèles soient disponibles sur le même port.

---

## Démarrage rapide

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd competitive-rag

# 2. Copier et remplir le fichier d'environnement
cp .env.example .env
# Éditer .env : générer SECRET_KEY et API_KEY_SALT, renseigner les mots de passe

# 3. Lancer tous les services
docker compose up --build
```

Une fois les conteneurs démarrés :

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API Swagger (dev uniquement) | http://localhost:8000/docs |
| Qdrant dashboard | http://localhost:6333/dashboard |
| Flower (dev uniquement) | http://localhost:5555 |

> En production (`APP_ENV=production`), la Swagger UI et Redoc sont désactivées. Le frontend communique avec l'API via nginx sans exposer le port 8000.

---

## Environnement de développement backend (hors Docker)

Utile uniquement pour l'autocomplétion et la vérification de types dans l'IDE.

```bash
cd backend

# Créer et activer le venv
py -3.11 -m venv .venv          # Windows
python3.11 -m venv .venv        # macOS / Linux

source .venv/Scripts/activate   # Windows (Git Bash)
source .venv/bin/activate       # macOS / Linux

pip install --upgrade pip
pip install -e ".[dev]"
```

Dans VS Code : `Ctrl+Shift+P` → **Python: Select Interpreter** → sélectionner `backend/.venv`.

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
├── .env                        # Variables d'environnement (ne pas commiter)
├── .env.example                # Template à copier
├── .gitignore
├── docker-compose.yml          # Production
├── docker-compose.dev.yml      # Développement (hot-reload + Flower)
├── start.sh                    # Script de démarrage avec vérifications
├── PROJECT_CONTEXT.md          # Contexte complet du projet pour IA
│
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh           # Attente PostgreSQL + migrations Alembic
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/versions/       # Migrations base de données
│   ├── configs/                # Un dossier YAML par client
│   └── app/
│       ├── main.py             # Point d'entrée FastAPI + lifespan
│       ├── api/
│       │   ├── deps.py         # Auth API Key, CurrentClient, AdminClient
│       │   └── routes/         # chat.py, sources.py, ingestion.py, clients.py
│       ├── core/               # Config, database, logging, sécurité
│       ├── ingestion/          # Collecteurs RSS/scraping/PDF + pipeline
│       ├── rag/                # retriever.py, generator.py, chain.py
│       ├── models/             # SQLAlchemy : Client, Source, QueryLog
│       └── services/           # LLM factory, tâches Celery, scheduler
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf              # Proxy /api, gzip, cache, SPA fallback
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── pages/              # Chat.tsx, Dashboard.tsx, Admin.tsx
        ├── hooks/              # useChat.ts, useSources.ts, useDashboard.ts
        ├── components/         # chat/, dashboard/, admin/
        └── tests/              # Vitest + MSW (31 tests)
```

---

## Commandes utiles

```bash
# Démarrer (rebuild si fichiers modifiés)
docker compose up --build

# Démarrer sans rebuild (relance simple)
docker compose up

# Arrêter sans supprimer les volumes
docker compose down

# Arrêter et supprimer tous les volumes (reset BDD)
docker compose down -v

# Logs d'un service spécifique
docker compose logs -f api
docker compose logs -f worker

# Lancer les tests frontend
cd frontend && npm test
```

---

## Dépannage

### `env: 'bash\r': No such file or directory` au démarrage de `api`, `worker` ou `beat`

Cause : `entrypoint.sh` a été sauvegardé avec des fins de ligne Windows (CRLF) au lieu de Unix (LF), ce qui casse le shebang `#!/usr/bin/env bash`.

Correction :

```bash
sed -i 's/\r$//' backend/entrypoint.sh
docker compose build --no-cache api worker beat
docker compose up -d
```

Prévention : un fichier `.gitattributes` à la racine force les `.sh` à rester en LF, même sous Windows :

```
*.sh text eol=lf
```

Vérifier aussi que `git config core.autocrlf` est sur `input` et non `true`.

---

## Notes importantes

- `docker compose up --build` est nécessaire uniquement quand on modifie des fichiers Python, le frontend, ou la configuration Docker.
- Modifier un YAML de configuration client ne nécessite pas de rebuild.
- Le modèle d'embedding doit rester cohérent sur toute la durée de vie du projet. Changer de modèle implique de ré-indexer tous les documents dans Qdrant.
- `SECRET_KEY` et `API_KEY_SALT` sont à définir une fois et ne plus jamais changer. Modifier `API_KEY_SALT` invalide toutes les clés API existantes.
- Ne jamais utiliser LangChain dans ce projet. La bibliothèque RAG est exclusivement LlamaIndex.