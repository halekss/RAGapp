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

## Environnement de développement backend

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
python.exe -m pip install --upgrade pip   # Windows
pip install --upgrade pip                 # macOS / Linux

# 5. Installer les dépendances
pip install -e ".[dev]"
```

Le flag `-e` installe le projet en mode editable : les modifications du code sont prises en compte sans réinstaller. Le `[dev]` inclut les outils de développement (pytest, ruff, mypy).

Une fois installé, sélectionner l'interpréteur du venv dans VS Code via `Ctrl+Shift+P` > `Python: Select Interpreter`, puis choisir `.venv\Scripts\python.exe` dans le dossier `backend/`.

> Le venv sert uniquement pour l'autocomplétion de l'IDE et les tests unitaires. L'application elle-même tourne dans Docker et gère son propre environnement Python isolé.

## Prérequis : LM Studio

L'application utilise LM Studio pour l'inférence et l'embedding en local, sans aucune clé API payante.

Les deux modèles suivants doivent être installés dans LM Studio :

| Rôle | Modèle |
|---|---|
| Génération | `meta-llama-3.1-8b-instruct` |
| Embedding | `nomic-ai/nomic-embed-text-v1.5` |

Avant de lancer Docker, démarrer le serveur local dans LM Studio (onglet **Developer**) sur le port `1234`. Le **Just-in-Time Model Loading** doit être activé pour que les deux modèles soient chargés à la demande sur le même port.

Pour basculer sur OpenAI plus tard, il suffit de changer deux lignes dans le `.env` :

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

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