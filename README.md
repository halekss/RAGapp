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
- Python 3.11
- LM Studio avec les modèles suivants installés et le serveur démarré sur le port `1234` :

| Rôle | Modèle |
|---|---|
| Génération | `meta-llama-3.1-8b-instruct` |
| Embedding | `nomic-ai/nomic-embed-text-v1.5` |

Le **Just-in-Time Model Loading** doit être activé dans LM Studio (onglet Developer) pour que les deux modèles soient disponibles sur le même port.

---

## Démarrage rapide (Docker)

C'est la méthode recommandée. Docker gère l'intégralité des dépendances : aucun `npm install` ni `pip install` à faire manuellement.

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd competitive-rag

# 2. Vérifier que le .env est bien présent à la racine
#    (il est commité, aucune action nécessaire)

# 3. Lancer l'environnement de développement
docker compose -f docker-compose.dev.yml up --build
```

Une fois les conteneurs démarrés :

| Service | URL |
|---|---|
| API | http://localhost:8000 |
| Documentation Swagger | http://localhost:8000/docs |
| Frontend | http://localhost:3000 |
| Flower (monitoring Celery) | http://localhost:5555 |

---

## Environnement de développement backend (hors Docker)

Cette section est utile uniquement si tu souhaites travailler sur le code backend avec l'autocomplétion et la vérification de types dans ton IDE.

Prérequis : Python 3.11 installé sur la machine.

```bash
# 1. Se placer dans le dossier backend
cd backend

# 2. Créer le venv
py -3.11 -m venv .venv          # Windows
python3.11 -m venv .venv        # macOS / Linux

# 3. Activer le venv
source .venv/Scripts/activate   # Windows (Git Bash)
source .venv/bin/activate       # macOS / Linux

# 4. Mettre pip à jour
pip install --upgrade pip

# 5. Installer les dépendances
pip install -e ".[dev]"
```

Le flag `-e` installe le projet en mode editable : les modifications du code sont prises en compte sans réinstaller. Le `[dev]` inclut les outils de développement (pytest, ruff, mypy).

Dans VS Code, sélectionner ensuite l'interpréteur qui pointe vers `backend/.venv` via `Ctrl+Shift+P` → **Python: Select Interpreter**.

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
├── .env                        # Variables d'environnement (commité)
├── docker-compose.yml          # Production
├── docker-compose.dev.yml      # Développement (hot-reload + Flower)
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

## Notes importantes

- `docker compose up --build` est nécessaire uniquement quand on modifie des fichiers Python, le frontend, ou la configuration Docker. Pour les simples relances, `docker compose up` suffit.
- Modifier un YAML de configuration client ne nécessite pas de rebuild.
- Le modèle d'embedding doit rester cohérent sur toute la durée de vie du projet. Changer de modèle implique de ré-indexer tous les documents dans Qdrant.
- `SECRET_KEY` et `API_KEY_SALT` sont à définir une fois en production et ne plus jamais changer.