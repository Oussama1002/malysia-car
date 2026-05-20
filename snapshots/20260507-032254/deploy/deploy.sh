#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DriveFlow — Production Deployment Script   (Phases 3 & 4)
#
# Usage:
#   DEPLOY_BYPASS_SECRET=xxx ./deploy/deploy.sh v1.0.0-rc1
#
# Variables d'environnement:
#   DEPLOY_BYPASS_SECRET   Secret de bypass maintenance (NE PAS hardcoder — passer via CI secrets)
#   VITE_API_BASE          URL API pour le build frontend (ex: https://api.driveflow.yourdomain.com/api/v1)
#   MYSQL_DEFAULTS_FILE    Chemin vers le fichier ~/.my.cnf ou /etc/driveflow/mysql.cnf (défaut: /etc/driveflow/mysql.cnf)
#
# Prérequis sur le serveur:
#   - Git, PHP 8.2+, Composer 2, Node 20+, npm
#   - MySQL 8.x + /etc/driveflow/mysql.cnf configuré (voir runbook.md)
#   - backend/.env déjà en place (copié depuis deploy/.env.production.example)
#   - www-data peut écrire dans backend/storage/ et backend/bootstrap/cache/
#
# Run as: sudo -u www-data bash deploy/deploy.sh v1.0.0-rc1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DEPLOY_ROOT="/var/www/driveflow"
BACKEND="$DEPLOY_ROOT/backend"
FRONTEND="$DEPLOY_ROOT/frontend"
ARTISAN="php $BACKEND/artisan"
TAG="${1:-HEAD}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/driveflow"
MYSQL_CNF="${MYSQL_DEFAULTS_FILE:-/etc/driveflow/mysql.cnf}"

# ── Couleurs ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}  $*"; }
info() { echo -e "${YELLOW}[..]${NC}  $*"; }
fail() { echo -e "${RED}[ERR]${NC} $*" >&2; exit 1; }

echo "═══════════════════════════════════════════════════"
echo " DriveFlow Deploy — tag: $TAG — $TIMESTAMP"
echo "═══════════════════════════════════════════════════"

# ── Phase 0: sanity checks ────────────────────────────────────────────────────
info "Vérification des prérequis…"
command -v php      >/dev/null 2>&1 || fail "php introuvable"
command -v composer >/dev/null 2>&1 || fail "composer introuvable"
command -v git      >/dev/null 2>&1 || fail "git introuvable"
command -v mysqldump >/dev/null 2>&1 || fail "mysqldump introuvable — backup impossible"

[[ -f "$BACKEND/.env" ]] || fail "backend/.env manquant — copier depuis deploy/.env.production.example"
[[ -f "$MYSQL_CNF" ]]    || fail "$MYSQL_CNF manquant — créer le fichier d'options MySQL (voir runbook.md)"

# APP_DEBUG doit être false
APP_DEBUG=$(grep -E '^APP_DEBUG=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' | tr -d ' ' || true)
[[ "$APP_DEBUG" == "false" ]] || fail "APP_DEBUG doit être 'false' dans le .env de production"

# APP_KEY doit commencer par base64:
APP_KEY=$(grep -E '^APP_KEY=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' | tr -d ' ' || true)
[[ "$APP_KEY" =~ ^base64: ]] || fail "APP_KEY invalide ou manquant (doit commencer par 'base64:'). Exécuter: php artisan key:generate --show"

# APP_ENV doit être production
APP_ENV=$(grep -E '^APP_ENV=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' | tr -d ' ' || true)
[[ "$APP_ENV" == "production" ]] || fail "APP_ENV doit être 'production' (actuel: $APP_ENV)"

# DEPLOY_BYPASS_SECRET ne doit PAS être dans le code source
[[ -n "${DEPLOY_BYPASS_SECRET:-}" ]] || {
    info "DEPLOY_BYPASS_SECRET non défini — génération d'un secret aléatoire pour ce deploy"
    DEPLOY_BYPASS_SECRET=$(openssl rand -hex 16)
    echo "  Bypass secret: $DEPLOY_BYPASS_SECRET"
    echo "  URL de bypass: https://$(grep -E '^APP_URL=' "$BACKEND/.env" | cut -d= -f2 | sed 's|https://||' | tr -d '"')/?secret=$DEPLOY_BYPASS_SECRET"
}

ok "Prérequis validés"

# ── Phase 1: pull release tag ─────────────────────────────────────────────────
info "Fetch et checkout $TAG…"
cd "$DEPLOY_ROOT"
git fetch --tags
git checkout "$TAG"
ok "Checkout $TAG"

# ── Phase 2: maintenance mode ON ─────────────────────────────────────────────
info "Activation du mode maintenance…"
$ARTISAN down --retry=10 --refresh=5 --secret="$DEPLOY_BYPASS_SECRET"
ok "Mode maintenance ON"

# Trap pour remettre le site en ligne si le script échoue
trap '$ARTISAN up && echo "Mode maintenance désactivé par le trap derreur"' ERR

# ── Phase 3a: Backup DB avant migration (OBLIGATOIRE) ────────────────────────
info "Backup de la base de données avant migration…"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/pre_deploy_${TIMESTAMP}.sql.gz"
mysqldump --defaults-file="$MYSQL_CNF" \
    --single-transaction \
    --routines \
    --triggers \
    --set-gtid-purged=OFF \
    | gzip > "$BACKUP_FILE"
[[ -f "$BACKUP_FILE" && -s "$BACKUP_FILE" ]] \
    && ok "Backup: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))" \
    || fail "Backup échoué — deploy annulé pour sécurité des données"

# ── Phase 3b: backend ─────────────────────────────────────────────────────────
info "Installation des dépendances PHP (production, sans dev)…"
cd "$BACKEND"
composer install --no-dev --optimize-autoloader --no-interaction
ok "composer install terminé"

info "Nettoyage et reconstruction des caches…"
$ARTISAN config:clear
$ARTISAN route:clear
$ARTISAN view:clear
$ARTISAN config:cache
$ARTISAN route:cache
$ARTISAN view:cache
ok "Caches reconstruits"

info "Exécution des migrations…"
$ARTISAN migrate --force
ok "Migrations terminées"

info "Redémarrage des queue workers…"
$ARTISAN queue:restart
ok "Queue workers signalés"

# Permissions storage: owner www-data, pas d'écriture pour others
info "Correction des permissions storage…"
find "$BACKEND/storage" -type d -exec chmod 755 {} \;
find "$BACKEND/storage" -type f -exec chmod 644 {} \;
find "$BACKEND/bootstrap/cache" -type d -exec chmod 755 {} \;
find "$BACKEND/bootstrap/cache" -type f -exec chmod 644 {} \;
ok "Permissions corrigées (755 dirs / 644 files)"

# ── Phase 4: frontend ─────────────────────────────────────────────────────────
info "Build frontend…"
cd "$FRONTEND"
export VITE_API_BASE="${VITE_API_BASE:-https://api.driveflow.yourdomain.com/api/v1}"
export VITE_DEMO_MODE=false
export VITE_SHOW_EXPERIMENTAL=false

# Sauvegarder le dist courant avant d'écraser (pour rollback rapide)
if [[ -d "$FRONTEND/dist" ]]; then
    PREV_TAG=$(git -C "$DEPLOY_ROOT" describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "prev")
    cp -r "$FRONTEND/dist" "$BACKUP_DIR/dist_${PREV_TAG}" 2>/dev/null || true
    ok "Dist précédent sauvegardé → $BACKUP_DIR/dist_${PREV_TAG}"
fi

npm ci --prefer-offline
npm run build
ok "Frontend buildé → $FRONTEND/dist"

# ── Désactiver le mode maintenance ────────────────────────────────────────────
trap - ERR  # Retirer le trap maintenant que tout s'est bien passé
info "Désactivation du mode maintenance…"
$ARTISAN up
ok "Mode maintenance OFF"

# ── PHP-FPM reload (vide opcache) ─────────────────────────────────────────────
if systemctl is-active --quiet php8.2-fpm 2>/dev/null; then
    # www-data ne peut pas reloader php-fpm sans sudo — ajouter dans sudoers:
    # www-data ALL=(ALL) NOPASSWD: /bin/systemctl reload php8.2-fpm
    sudo systemctl reload php8.2-fpm 2>/dev/null \
        && ok "PHP-FPM rechargé (opcache vidé)" \
        || info "PHP-FPM reload ignoré (droits sudo manquants) — opcache non vidé"
fi

# ── Nettoyage anciens backups (garder 10 derniers) ───────────────────────────
info "Nettoyage des anciens backups DB…"
ls -t "$BACKUP_DIR"/pre_deploy_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm --
ok "Anciens backups purgés"

echo ""
echo "═══════════════════════════════════════════════════"
echo " Deploy terminé. Lancer les smoke tests:"
echo "   SMOKE_EMAIL=admin@co.ma SMOKE_PASSWORD=xxx \\"
echo "   bash deploy/smoke-test.sh https://api.driveflow.yourdomain.com/api/v1"
echo ""
echo " Backup pré-déploiement: $BACKUP_FILE"
echo "═══════════════════════════════════════════════════"
