#!/usr/bin/env bash
# start.sh — Démarrage de l'environnement de production
# Usage : ./start.sh [--build] [--reset]
#   --build  : force la reconstruction des images Docker
#   --reset  : supprime les volumes (reset BDD et index vectoriel)

set -euo pipefail

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

BUILD_FLAG=""
RESET_FLAG=""

for arg in "$@"; do
  case $arg in
    --build) BUILD_FLAG="--build" ;;
    --reset) RESET_FLAG="-v" ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════╗"
echo "║      Competitive RAG — Production    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Vérifier que .env existe ───────────────────────────────────────────────
if [ ! -f ".env" ]; then
  fail ".env introuvable. Copier .env.example et remplir les valeurs :\n  cp .env.example .env"
fi
ok ".env trouvé"

# ── 2. Vérifier les variables critiques ───────────────────────────────────────
check_var() {
  val=$(grep -E "^$1=" .env | cut -d= -f2-)
  if [ -z "$val" ] || [ "$val" = "changeme" ]; then
    fail "Variable $1 non définie ou égale à 'changeme' dans .env"
  fi
}

check_var "SECRET_KEY"
check_var "API_KEY_SALT"
check_var "POSTGRES_PASSWORD"
ok "Variables critiques présentes"

# ── 3. Vérifier que Docker est disponible ────────────────────────────────────
if ! command -v docker &> /dev/null; then
  fail "Docker non trouvé. Installer Docker Desktop."
fi
if ! docker info &> /dev/null; then
  fail "Le daemon Docker n'est pas démarré."
fi
ok "Docker disponible"

# ── 4. Reset optionnel ────────────────────────────────────────────────────────
if [ -n "$RESET_FLAG" ]; then
  warn "Reset des volumes demandé — toutes les données seront supprimées."
  read -p "  Confirmer ? (oui/non) : " confirm
  if [ "$confirm" != "oui" ]; then
    echo "Annulé."
    exit 0
  fi
  docker compose down -v 2>/dev/null || true
  ok "Volumes supprimés"
fi

# ── 5. Lancer les services ────────────────────────────────────────────────────
echo ""
echo "Démarrage des services..."
docker compose up -d $BUILD_FLAG

echo ""
ok "Services démarrés"
echo ""
echo "  Frontend  →  http://localhost:3000"
echo "  API docs  →  http://localhost:8000/docs  (si port exposé en dev)"
echo ""
echo "Logs en temps réel : docker compose logs -f"
echo "Arrêt             : docker compose down"
echo ""