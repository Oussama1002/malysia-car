#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DriveFlow — Phase 0 Gate: Pre-Deploy Checklist
#
# Valide tous les critères "prêt à déployer" avant d'autoriser deploy.sh.
# Exit code 0 = PASS (safe to deploy). Non-zero = BLOQUÉ.
#
# Usage:
#   bash deploy/pre-deploy-checklist.sh [API_BASE_URL]
#
# Variables:
#   BACKEND_PATH         Chemin vers le répertoire backend (défaut: /var/www/driveflow/backend)
#   MYSQL_DEFAULTS_FILE  Chemin vers /etc/driveflow/mysql.cnf
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
# NOTE: set -e retiré — les vérifications qui échouent doivent être comptées,
# pas interrompre le script. Chaque check gère son propre exit code.

API="${1:-https://api.driveflow.yourdomain.com/api/v1}"
BACKEND="${BACKEND_PATH:-/var/www/driveflow/backend}"
MYSQL_CNF="${MYSQL_DEFAULTS_FILE:-/etc/driveflow/mysql.cnf}"
PASS=0; FAIL=0; WARN=0

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
pass()    { echo -e "  ${GREEN}[PASS]${NC}  $*"; PASS=$((PASS + 1)); }
fail()    { echo -e "  ${RED}[FAIL]${NC}  $*"; FAIL=$((FAIL + 1)); }
warn()    { echo -e "  ${YELLOW}[WARN]${NC}  $*"; WARN=$((WARN + 1)); }
section() { echo -e "\n${BOLD}$*${NC}"; }

echo "═══════════════════════════════════════════════════"
echo " DriveFlow — Pre-Deploy Readiness Gate"
echo " API: $API"
echo " Date: $(date)"
echo "═══════════════════════════════════════════════════"

# ── A. Environnement serveur ──────────────────────────────────────────────────
section "A. Environnement serveur"

# Version PHP — via php8.2 si disponible, sinon php
PHP_BIN=$(command -v php8.2 2>/dev/null || command -v php 2>/dev/null || echo "")
if [[ -z "$PHP_BIN" ]]; then
    fail "php introuvable dans PATH"
else
    PHP_VER=$("$PHP_BIN" -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo "0.0")
    PHP_MAJOR=${PHP_VER%%.*}
    PHP_MINOR=${PHP_VER##*.}
    if [[ "$PHP_MAJOR" -gt 8 ]] || [[ "$PHP_MAJOR" -eq 8 && "$PHP_MINOR" -ge 2 ]]; then
        pass "PHP $PHP_VER (≥ 8.2 requis) — binaire: $PHP_BIN"
    else
        fail "PHP $PHP_VER — version 8.2+ requise"
    fi

    for EXT in pdo_mysql mbstring openssl tokenizer xml ctype json fileinfo gd; do
        "$PHP_BIN" -m 2>/dev/null | grep -q "^${EXT}$" \
            && pass "Extension PHP: $EXT" \
            || fail "Extension PHP manquante: $EXT — sudo apt install php8.2-${EXT}"
    done
fi

command -v composer  >/dev/null 2>&1 && pass "composer trouvé" || fail "composer introuvable"
command -v mysqldump >/dev/null 2>&1 && pass "mysqldump trouvé" || fail "mysqldump introuvable — backups impossibles"
command -v git       >/dev/null 2>&1 && pass "git trouvé"      || warn "git introuvable"

# ── B. Fichier d'options MySQL ────────────────────────────────────────────────
section "B. Credentials MySQL (fichier sécurisé)"

if [[ -f "$MYSQL_CNF" ]]; then
    PERMS=$(stat -c "%a" "$MYSQL_CNF" 2>/dev/null || echo "000")
    [[ "$PERMS" == "600" ]] \
        && pass "$MYSQL_CNF présent, permissions 600" \
        || fail "$MYSQL_CNF permissions $PERMS — doit être 600 (chmod 600 $MYSQL_CNF)"
else
    fail "$MYSQL_CNF manquant — créer le fichier (voir runbook.md Section 'Credentials MySQL')"
fi

# ── C. Configuration .env ─────────────────────────────────────────────────────
section "C. Configuration .env production"

if [[ ! -f "$BACKEND/.env" ]]; then
    fail ".env manquant: $BACKEND/.env"
else
    pass ".env présent"

    # Fonction de vérification d'une variable .env
    check_env() {
        local KEY="$1" EXPECTED="$2"
        local VAL
        VAL=$(grep -E "^${KEY}=" "$BACKEND/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs 2>/dev/null || echo "")
        if [[ -n "$EXPECTED" ]]; then
            [[ "$VAL" == "$EXPECTED" ]] \
                && pass "$KEY=$EXPECTED" \
                || fail "$KEY=$VAL (attendu: $EXPECTED)"
        else
            [[ -n "$VAL" ]] \
                && pass "$KEY est défini" \
                || fail "$KEY est vide ou manquant"
        fi
    }

    check_env APP_ENV   production
    check_env APP_DEBUG false

    # APP_KEY doit commencer par base64:
    APP_KEY_VAL=$(grep -E '^APP_KEY=' "$BACKEND/.env" | head -1 | cut -d= -f2- | tr -d '"' | xargs 2>/dev/null || echo "")
    [[ "$APP_KEY_VAL" =~ ^base64: ]] \
        && pass "APP_KEY format valide (base64:...)" \
        || fail "APP_KEY invalide — doit commencer par 'base64:'. Exécuter: php artisan key:generate --show"

    check_env DB_DATABASE  ""
    check_env DB_USERNAME  ""
    check_env DB_PASSWORD  ""
    check_env SANCTUM_STATEFUL_DOMAINS ""
    check_env FRONTEND_URL ""
    check_env TRUSTED_PROXIES ""

    # SESSION_SAME_SITE
    SS=$(grep -E '^SESSION_SAME_SITE=' "$BACKEND/.env" | head -1 | cut -d= -f2 | tr -d '"' | xargs 2>/dev/null || echo "")
    [[ "$SS" == "lax" || "$SS" == "strict" ]] \
        && pass "SESSION_SAME_SITE=$SS" \
        || warn "SESSION_SAME_SITE non défini ou invalide ($SS) — risque CSRF"

    # Mail ne doit pas être "log"
    MAIL_VAL=$(grep -E '^MAIL_MAILER=' "$BACKEND/.env" | head -1 | cut -d= -f2 | tr -d '"' | xargs 2>/dev/null || echo "log")
    [[ "$MAIL_VAL" != "log" ]] \
        && pass "MAIL_MAILER=$MAIL_VAL (pas log)" \
        || warn "MAIL_MAILER=log — les emails ne seront pas envoyés en production"
fi

# ── D. Storage & permissions ──────────────────────────────────────────────────
section "D. Storage & Permissions"

# Tester les permissions comme www-data (pas comme l'utilisateur courant)
for DIR in "$BACKEND/storage" "$BACKEND/bootstrap/cache"; do
    if [[ -d "$DIR" ]]; then
        if sudo -u www-data test -w "$DIR" 2>/dev/null; then
            pass "Writable par www-data: $DIR"
        else
            fail "PAS writable par www-data: $DIR"
            echo "       Corriger: sudo chown -R www-data:www-data $DIR && sudo chmod -R 755 $DIR"
        fi
    else
        fail "Répertoire manquant: $DIR"
    fi
done

# Symlink storage → public
if [[ -L "$BACKEND/public/storage" ]]; then
    LINK_TARGET=$(readlink "$BACKEND/public/storage")
    pass "Symlink storage → $LINK_TARGET"
else
    warn "Symlink manquant: $BACKEND/public/storage — exécuter: php artisan storage:link"
fi

# Vérifier que /storage/app n'est PAS dans le web root Nginx
# (la config nginx.conf correcte bloque /storage/ avec deny all)
if grep -q "deny all" /etc/nginx/sites-enabled/driveflow 2>/dev/null || \
   grep -q "return 403" /etc/nginx/sites-enabled/driveflow 2>/dev/null; then
    pass "Nginx: /storage/ bloqué (deny all ou return 403)"
else
    warn "Vérifier manuellement que Nginx bloque /storage/ — risque d'exposition KYC/PDFs"
fi

# ── E. Connectivité base de données ──────────────────────────────────────────
section "E. Base de données"

if [[ -f "$MYSQL_CNF" ]]; then
    if mysql --defaults-file="$MYSQL_CNF" -e "SELECT 1" >/dev/null 2>&1; then
        DB_NAME=$(grep -E '^database=' "$MYSQL_CNF" | cut -d= -f2 | xargs 2>/dev/null || \
                  grep -E '^DB_DATABASE=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' | xargs 2>/dev/null || echo "?")
        pass "Connexion MySQL OK ($DB_NAME)"
    else
        fail "Connexion MySQL échouée — vérifier $MYSQL_CNF"
    fi

    # Migrations en attente
    PENDING=$(php "$BACKEND/artisan" migrate:status --no-ansi 2>/dev/null \
        | grep -cE '\|\s+No\s+\|' || echo "0")
    if [[ "$PENDING" -eq 0 ]]; then
        pass "Aucune migration en attente"
    else
        warn "$PENDING migration(s) en attente — seront appliquées par deploy.sh"
    fi

    # Collation
    DB_NAME_ENV=$(grep -E '^DB_DATABASE=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' | xargs 2>/dev/null || echo "")
    if [[ -n "$DB_NAME_ENV" ]]; then
        COLLATION=$(mysql --defaults-file="$MYSQL_CNF" \
            -se "SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$DB_NAME_ENV';" 2>/dev/null || echo "")
        [[ "$COLLATION" == "utf8mb4_unicode_ci" || "$COLLATION" == "utf8mb4_general_ci" ]] \
            && pass "Collation MySQL: $COLLATION" \
            || warn "Collation MySQL: $COLLATION (recommandé: utf8mb4_unicode_ci)"
    fi
fi

# ── F. Scheduler (Cron) ───────────────────────────────────────────────────────
section "F. Scheduler Laravel (Cron)"

if sudo crontab -u www-data -l 2>/dev/null | grep -q "schedule:run"; then
    CRON_LINE=$(sudo crontab -u www-data -l 2>/dev/null | grep "schedule:run")
    pass "schedule:run dans le crontab www-data"
    # Vérifier que c'est php8.2 et pas juste php
    echo "$CRON_LINE" | grep -q "php8.2" \
        && pass "Crontab utilise php8.2 (versionné)" \
        || warn "Crontab utilise 'php' non versionné — risque si plusieurs versions PHP"
else
    fail "schedule:run absent du crontab www-data — ajouter depuis deploy/crontab.example"
fi

# ── G. Queue workers ──────────────────────────────────────────────────────────
section "G. Queue Workers (Supervisor)"

if command -v supervisorctl >/dev/null 2>&1; then
    if supervisorctl status driveflow-worker 2>/dev/null | grep -q "RUNNING"; then
        pass "Supervisor: driveflow-worker RUNNING"
    else
        warn "Supervisor: driveflow-worker pas en cours — démarrer après le deploy"
    fi
else
    warn "supervisorctl introuvable — s'assurer que les workers sont gérés"
fi

# ── H. PHP-FPM configuration ─────────────────────────────────────────────────
section "H. PHP-FPM (upload limits)"

# Tester via PHP-FPM pool si php-fpm est disponible
PHP_FPM_UPLOAD=$(php-fpm8.2 -i 2>/dev/null | grep upload_max_filesize | head -1 | grep -oE '[0-9]+M' || echo "")
PHP_CLI_UPLOAD=$(php -r "echo ini_get('upload_max_filesize');" 2>/dev/null || echo "")
PHP_CLI_POST=$(php -r "echo ini_get('post_max_size');" 2>/dev/null || echo "")

if [[ -n "$PHP_FPM_UPLOAD" ]]; then
    pass "PHP-FPM upload_max_filesize: $PHP_FPM_UPLOAD"
else
    [[ -n "$PHP_CLI_UPLOAD" ]] \
        && warn "upload_max_filesize (CLI, pas FPM): $PHP_CLI_UPLOAD — vérifier /etc/php/8.2/fpm/php.ini" \
        || warn "Impossible de lire upload_max_filesize — vérifier php.ini"
fi

[[ -n "$PHP_CLI_POST" ]] && [[ "$PHP_CLI_POST" != "8M" ]] \
    && pass "post_max_size: $PHP_CLI_POST" \
    || warn "post_max_size à la valeur par défaut (8M) — doit être > upload_max_filesize (50M)"

# ── I. CORS / Sanctum ─────────────────────────────────────────────────────────
section "I. CORS / Sanctum"

if [[ -f "$BACKEND/.env" ]]; then
    FRONTEND_URL=$(grep -E '^FRONTEND_URL=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' | xargs 2>/dev/null || echo "")
    STATEFUL=$(grep -E '^SANCTUM_STATEFUL_DOMAINS=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' | xargs 2>/dev/null || echo "")
    [[ -n "$STATEFUL" ]] \
        && pass "SANCTUM_STATEFUL_DOMAINS: $STATEFUL" \
        || fail "SANCTUM_STATEFUL_DOMAINS vide — Sanctum rejettera les requêtes frontend"
    [[ -n "$FRONTEND_URL" ]] \
        && pass "FRONTEND_URL: $FRONTEND_URL" \
        || warn "FRONTEND_URL vide"
fi

# ── J. Health endpoint ────────────────────────────────────────────────────────
section "J. Health endpoint"

if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    HEALTH=$(curl -sf --max-time 10 "$API/health" 2>/dev/null || echo "UNREACHABLE")
    if [[ "$HEALTH" == "UNREACHABLE" ]]; then
        warn "Health endpoint inaccessible: $API/health (normal si pas encore déployé)"
    else
        H_STATUS=$(echo "$HEALTH" | jq -r '.data.status // "unknown"' 2>/dev/null || echo "parse_error")
        H_DB=$(echo "$HEALTH" | jq -r '.data.checks.database // "unknown"' 2>/dev/null || echo "unknown")
        [[ "$H_STATUS" == "ok" ]] && pass "Health: status=ok"   || fail "Health: status=$H_STATUS"
        [[ "$H_DB" == "ok" ]]     && pass "Health: database=ok" || warn "Health: database=$H_DB"
        # Ne doit PAS exposer l'env en production
        H_ENV=$(echo "$HEALTH" | jq -r '.data.env // empty' 2>/dev/null || echo "")
        [[ -z "$H_ENV" ]] \
            && pass "Health: env non exposé publiquement" \
            || warn "Health: env=$H_ENV exposé publiquement — retirer du HealthController"
    fi
else
    warn "curl ou jq manquant — vérification health ignorée"
fi

# ── K. Release tag ────────────────────────────────────────────────────────────
section "K. Git release tag"

DEPLOY_ROOT="${DEPLOY_ROOT:-$(dirname "$BACKEND")}"
if command -v git >/dev/null 2>&1 && git -C "$DEPLOY_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    TAG_COUNT=$(git -C "$DEPLOY_ROOT" tag -l "v*" | wc -l)
    LATEST_TAG=$(git -C "$DEPLOY_ROOT" tag -l "v*" --sort=-version:refname | head -1 || echo "")
    [[ "$TAG_COUNT" -gt 0 ]] \
        && pass "$TAG_COUNT tag(s) de release (dernier: $LATEST_TAG)" \
        || warn "Aucun tag de release — créer avant de déployer: git tag v1.0.0-rc1"
fi

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo -e " ${GREEN}PASS: $PASS${NC}   ${RED}FAIL: $FAIL${NC}   ${YELLOW}WARN: $WARN${NC}"
if [[ $FAIL -eq 0 ]]; then
    echo -e " ${GREEN}${BOLD}GATE: PASSÉ — safe to deploy${NC}"
    echo " Exécuter: DEPLOY_BYPASS_SECRET=xxx sudo -u www-data bash deploy/deploy.sh <TAG>"
    exit 0
else
    echo -e " ${RED}${BOLD}GATE: BLOQUÉ — corriger $FAIL échec(s) avant de déployer${NC}"
    exit 1
fi
