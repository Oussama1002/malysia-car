#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DriveFlow — Rollback Script   (Phase 7)
#
# Usage:
#   ./deploy/rollback.sh <PREVIOUS_TAG> [--db <BACKUP_FILE>]
#
#   --db <BACKUP_FILE>   Restaurer un dump SQL spécifique (DERNIER RECOURS — perte de données).
#                        Passer le chemin complet du backup pre_deploy_*.sql.gz.
#                        Ne PAS utiliser le backup le plus récent automatiquement
#                        pour éviter de restaurer le mauvais snapshot.
#
# Exemples:
#   ./deploy/rollback.sh v0.9.5
#   ./deploy/rollback.sh v0.9.5 --db /var/backups/driveflow/pre_deploy_20260501_140000.sql.gz
#
# Variables:
#   MYSQL_DEFAULTS_FILE  Chemin vers /etc/driveflow/mysql.cnf (défaut)
#   VITE_API_BASE        URL API pour le rebuild frontend si dist backup absent
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
# NOTE: set -e retiré intentionnellement — migrate:rollback peut échouer légitimement
# et on veut continuer vers la restauration du frontend même si le rollback DB échoue.

DEPLOY_ROOT="/var/www/driveflow"
BACKEND="$DEPLOY_ROOT/backend"
FRONTEND="$DEPLOY_ROOT/frontend"
ARTISAN="php $BACKEND/artisan"
BACKUP_DIR="/var/backups/driveflow"
MYSQL_CNF="${MYSQL_DEFAULTS_FILE:-/etc/driveflow/mysql.cnf}"
PREVIOUS_TAG="${1:-}"
DO_DB_RESTORE=false
DB_BACKUP_FILE=""

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}  $*"; }
info() { echo -e "${YELLOW}[..]${NC}  $*"; }
fail() { echo -e "${RED}[ERR]${NC} $*" >&2; exit 1; }

[[ -n "$PREVIOUS_TAG" ]] || fail "Usage: $0 <PREVIOUS_TAG> [--db <BACKUP_FILE>]"

# Parse args
shift
while [[ $# -gt 0 ]]; do
    case "$1" in
        --db)
            DO_DB_RESTORE=true
            DB_BACKUP_FILE="${2:-}"
            [[ -n "$DB_BACKUP_FILE" ]] || fail "--db requiert un chemin de fichier: --db /var/backups/driveflow/pre_deploy_YYYYMMDD.sql.gz"
            [[ -f "$DB_BACKUP_FILE" ]] || fail "Fichier backup introuvable: $DB_BACKUP_FILE"
            shift 2
            ;;
        *) fail "Argument inconnu: $1" ;;
    esac
done

echo "═══════════════════════════════════════════════════"
echo " DriveFlow ROLLBACK → $PREVIOUS_TAG"
[[ "$DO_DB_RESTORE" == true ]] && echo " !! RESTORE DB depuis: $DB_BACKUP_FILE !!"
echo "═══════════════════════════════════════════════════"

# Confirmation interactive (safe en mode TTY, refuse si piped)
if [[ -t 0 ]]; then
    read -rp "Taper 'rollback' pour confirmer: " CONFIRM
    [[ "$CONFIRM" == "rollback" ]] || { echo "Annulé."; exit 1; }
else
    fail "Ce script doit être exécuté interactivement (stdin TTY requis pour la confirmation)."
fi

# Prérequis
[[ -f "$MYSQL_CNF" ]] || fail "$MYSQL_CNF manquant — impossible de se connecter à la base de données"
command -v mysqldump >/dev/null 2>&1 || fail "mysqldump introuvable"

# ── Backup snapshot de l'état actuel avant rollback ──────────────────────────
info "Snapshot DB de l'état actuel (avant rollback)…"
PRE_ROLLBACK_BACKUP="$BACKUP_DIR/pre_rollback_$(date +%Y%m%d_%H%M%S).sql.gz"
mkdir -p "$BACKUP_DIR"
mysqldump --defaults-file="$MYSQL_CNF" \
    --single-transaction --routines --triggers --set-gtid-purged=OFF \
    | gzip > "$PRE_ROLLBACK_BACKUP" \
    && ok "Snapshot: $PRE_ROLLBACK_BACKUP" \
    || info "Snapshot échoué — rollback DB sera plus risqué"

# ── Mode maintenance ON ───────────────────────────────────────────────────────
info "Activation du mode maintenance…"
$ARTISAN down --retry=10

# ── Checkout tag précédent ────────────────────────────────────────────────────
info "Checkout $PREVIOUS_TAG…"
cd "$DEPLOY_ROOT"
git fetch --tags
git checkout "$PREVIOUS_TAG"
ok "Checkout $PREVIOUS_TAG"

# ── Reinstaller les deps PHP pour l'ancien tag ────────────────────────────────
info "composer install pour $PREVIOUS_TAG…"
cd "$BACKEND"
composer install --no-dev --optimize-autoloader --no-interaction
ok "Dépendances PHP installées"

# ── Rebuild caches ────────────────────────────────────────────────────────────
$ARTISAN config:clear
$ARTISAN config:cache
$ARTISAN route:cache
$ARTISAN view:cache
ok "Caches reconstruits"

# ── Database: rollback ou restore ─────────────────────────────────────────────
if [[ "$DO_DB_RESTORE" == true ]]; then
    info "Restauration DB depuis $DB_BACKUP_FILE…"
    DB_NAME=$(grep -E '^DB_DATABASE=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' | tr -d ' ')
    zcat "$DB_BACKUP_FILE" | mysql --defaults-file="$MYSQL_CNF" "$DB_NAME" \
        && ok "Base de données restaurée depuis le backup" \
        || fail "Restauration DB échouée — base peut être corrompue. Snapshot pré-rollback: $PRE_ROLLBACK_BACKUP"
else
    info "Rollback de la dernière batch de migrations (si réversible)…"
    $ARTISAN migrate:rollback --force \
        && ok "Rollback migration effectué" \
        || info "migrate:rollback a échoué ou rien à rollback — vérifier manuellement"
fi

# ── Frontend: artifact ou rebuild ─────────────────────────────────────────────
info "Restauration du frontend pour $PREVIOUS_TAG…"
DIST_BACKUP="$BACKUP_DIR/dist_${PREVIOUS_TAG}"
if [[ -d "$DIST_BACKUP" ]]; then
    rm -rf "$FRONTEND/dist"
    cp -r "$DIST_BACKUP" "$FRONTEND/dist"
    ok "Frontend restauré depuis l'artifact $DIST_BACKUP (instantané)"
else
    info "Pas d'artifact dist trouvé pour $PREVIOUS_TAG — rebuild en cours…"
    info "ATTENTION: cela prend 3-8 minutes et nécessite Node.js sur le serveur"
    cd "$FRONTEND"
    export VITE_API_BASE="${VITE_API_BASE:-https://api.driveflow.yourdomain.com/api/v1}"
    export VITE_DEMO_MODE=false
    npm ci --prefer-offline \
        && npm run build \
        && ok "Frontend rebuild pour $PREVIOUS_TAG" \
        || fail "Build frontend échoué — site reste en maintenance. Restaurer manuellement $DIST_BACKUP"
fi

# ── Redémarrage workers + maintenance OFF ─────────────────────────────────────
$ARTISAN queue:restart
$ARTISAN up
ok "Mode maintenance désactivé"

sudo systemctl reload php8.2-fpm 2>/dev/null && ok "PHP-FPM rechargé" || true

echo ""
echo "═══════════════════════════════════════════════════"
echo " Rollback vers $PREVIOUS_TAG terminé."
echo " Snapshot pré-rollback: $PRE_ROLLBACK_BACKUP"
echo " Lancer les smoke tests:"
echo "   SMOKE_EMAIL=admin@co.ma SMOKE_PASSWORD=xxx bash deploy/smoke-test.sh"
echo "═══════════════════════════════════════════════════"
