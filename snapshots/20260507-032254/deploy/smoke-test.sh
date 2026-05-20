#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DriveFlow — Smoke Test Script   (Phase 6)
#
# Usage:
#   ./deploy/smoke-test.sh [API_BASE_URL] [FRONTEND_ORIGIN]
#   Credentials via env vars: SMOKE_EMAIL, SMOKE_PASSWORD
#
# Exit code 0 = all tests passed. Non-zero = one or more failures.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
# NOTE: set -e intentionally omitted — arithmetic counters and conditional
# curl failures must not abort the script mid-run.

API="${1:-https://api.driveflow.yourdomain.com/api/v1}"
FRONTEND_ORIGIN="${2:-https://app.driveflow.yourdomain.com}"
EMAIL="${SMOKE_EMAIL:-}"
PASSWORD="${SMOKE_PASSWORD:-}"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0

pass() { echo -e "  ${GREEN}PASS${NC}  $*"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}FAIL${NC}  $*"; FAIL=$((FAIL + 1)); }
info() { echo -e "${YELLOW}$*${NC}"; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Required command missing: $1"; exit 1; }; }
require_cmd curl
require_cmd jq

echo "═══════════════════════════════════════════════════"
echo " DriveFlow Smoke Tests — $API"
echo " $(date)"
echo "═══════════════════════════════════════════════════"

# ── Test 1: Health ────────────────────────────────────────────────────────────
info "\n[1] GET /health"
HEALTH=$(curl -sf --max-time 10 "$API/health" 2>/dev/null || echo "CURL_FAIL")
if [[ "$HEALTH" == "CURL_FAIL" ]]; then
    fail "Health endpoint unreachable — vérifier que le serveur répond"
else
    STATUS=$(echo "$HEALTH" | jq -r '.data.status // .status // "unknown"' 2>/dev/null || echo "parse_error")
    DB_CHECK=$(echo "$HEALTH" | jq -r '.data.checks.database // "unknown"' 2>/dev/null || echo "unknown")
    STORAGE_CHECK=$(echo "$HEALTH" | jq -r '.data.checks.storage // "unknown"' 2>/dev/null || echo "unknown")
    QUEUE_CHECK=$(echo "$HEALTH" | jq -r '.data.checks.queue // "unknown"' 2>/dev/null || echo "unknown")
    APP_KEY_CHECK=$(echo "$HEALTH" | jq -r '.data.checks.app_key // "unknown"' 2>/dev/null || echo "unknown")
    [[ "$STATUS" == "ok" ]]         && pass "status=ok"          || fail "status=$STATUS (dégradé)"
    [[ "$DB_CHECK" == "ok" ]]       && pass "database=ok"        || fail "database=$DB_CHECK"
    [[ "$STORAGE_CHECK" == "ok" ]]  && pass "storage=ok"         || fail "storage=$STORAGE_CHECK"
    [[ "$QUEUE_CHECK" == "ok" ]]    && pass "queue=ok"           || fail "queue=$QUEUE_CHECK"
    [[ "$APP_KEY_CHECK" == "ok" ]]  && pass "app_key=ok"         || fail "app_key=$APP_KEY_CHECK"
fi

# ── Test 2: HTTPS et headers de sécurité ─────────────────────────────────────
info "\n[2] HTTPS + Security headers"
SEC_HEADERS=$(curl -sf -I --max-time 10 "$API/health" 2>/dev/null || echo "CURL_FAIL")
if [[ "$SEC_HEADERS" != "CURL_FAIL" ]]; then
    echo "$SEC_HEADERS" | grep -qi "strict-transport-security" \
        && pass "HSTS header présent" || fail "HSTS header absent — vérifier Nginx TLS"
    echo "$SEC_HEADERS" | grep -qi "x-content-type-options" \
        && pass "X-Content-Type-Options présent" || fail "X-Content-Type-Options absent"
    echo "$SEC_HEADERS" | grep -qi "x-frame-options" \
        && pass "X-Frame-Options présent" || fail "X-Frame-Options absent"
    # L'URL doit être HTTPS
    [[ "$API" == https://* ]] \
        && pass "API URL utilise HTTPS" || fail "API URL n'utilise pas HTTPS — risque critique"
else
    fail "Impossible de vérifier les headers de sécurité"
fi

# ── Test 3: CORS preflight ────────────────────────────────────────────────────
info "\n[3] CORS preflight (OPTIONS)"
CORS_RESP=$(curl -sf -I -X OPTIONS --max-time 10 "$API/auth/login" \
    -H "Origin: $FRONTEND_ORIGIN" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type,Authorization" \
    2>/dev/null || echo "CURL_FAIL")
if [[ "$CORS_RESP" != "CURL_FAIL" ]]; then
    echo "$CORS_RESP" | grep -qi "access-control-allow-origin" \
        && pass "CORS: Access-Control-Allow-Origin présent" \
        || fail "CORS: Access-Control-Allow-Origin absent — Sanctum mal configuré"
    echo "$CORS_RESP" | grep -qi "access-control-allow-methods" \
        && pass "CORS: Access-Control-Allow-Methods présent" \
        || fail "CORS: Access-Control-Allow-Methods absent"
else
    fail "CORS preflight: requête échouée"
fi

# ── Test 4: Endpoint protégé refuse sans token ────────────────────────────────
info "\n[4] Route protégée → 401 sans token"
UNAUTH=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 \
    "$API/vehicles" -H "Accept: application/json" 2>/dev/null || echo "000")
[[ "$UNAUTH" == "401" ]] \
    && pass "GET /vehicles sans token → 401 (auth enforced)" \
    || fail "GET /vehicles sans token → $UNAUTH (attendu 401)"

# ── Tests authentifiés ────────────────────────────────────────────────────────
if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
    echo ""
    echo "SMOKE_EMAIL / SMOKE_PASSWORD non définis — tests authentifiés ignorés."
    echo "Relancer: SMOKE_EMAIL=admin@co.ma SMOKE_PASSWORD=secret bash deploy/smoke-test.sh"
    echo ""
else

# ── Test 5: Login ─────────────────────────────────────────────────────────────
info "\n[5] POST /auth/login"
LOGIN_RESP=$(curl -sf --max-time 15 -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Origin: $FRONTEND_ORIGIN" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null || echo "CURL_FAIL")
TOKEN=""
if [[ "$LOGIN_RESP" == "CURL_FAIL" ]]; then
    fail "POST /auth/login : requête échouée"
else
    TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.token // .token // empty' 2>/dev/null || echo "")
    [[ -n "$TOKEN" ]] \
        && pass "Token Sanctum émis" \
        || fail "Pas de token dans la réponse: $(echo "$LOGIN_RESP" | jq -c '.message // .' 2>/dev/null)"
fi

if [[ -n "$TOKEN" ]]; then

# ── Test 6: /auth/me ──────────────────────────────────────────────────────────
info "\n[6] GET /auth/me"
ME=$(curl -sf --max-time 10 "$API/auth/me" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" 2>/dev/null || echo "CURL_FAIL")
if [[ "$ME" != "CURL_FAIL" ]]; then
    ME_ID=$(echo "$ME" | jq -r '.data.id // empty' 2>/dev/null || echo "")
    [[ -n "$ME_ID" ]] && pass "/auth/me → user id=$ME_ID" || fail "/auth/me échoué"
else
    fail "/auth/me : requête échouée"
fi

# ── Test 7: Lectures basse criticité ─────────────────────────────────────────
info "\n[7] GET endpoints (vehicles, invoices, branches, dashboard, notifications)"
for ENDPOINT in vehicles invoices branches dashboard notifications; do
    CODE=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$API/$ENDPOINT" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Accept: application/json" 2>/dev/null || echo "000")
    [[ "$CODE" == "200" ]] \
        && pass "GET /$ENDPOINT → 200" \
        || fail "GET /$ENDPOINT → $CODE (attendu 200)"
done

# ── Test 8: Pas de 500 sur la finance ────────────────────────────────────────
info "\n[8] Absence de 500 sur endpoints financiers"
for ENDPOINT in "accounting/accounts" "accounting/journals" "arrears/cases"; do
    CODE=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$API/$ENDPOINT" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Accept: application/json" 2>/dev/null || echo "000")
    [[ "$CODE" != "500" ]] \
        && pass "GET /$ENDPOINT → $CODE (pas de 500)" \
        || fail "GET /$ENDPOINT → 500 (erreur serveur)"
done

# ── Test 9: PDF accessible (DomPDF / extensions PHP) ─────────────────────────
info "\n[9] GET /documents (DomPDF / generated docs)"
DOC_CODE=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 15 "$API/documents" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" 2>/dev/null || echo "000")
[[ "$DOC_CODE" == "200" ]] \
    && pass "GET /documents → 200 (DomPDF disponible)" \
    || fail "GET /documents → $DOC_CODE"

# ── Test 10: Logout invalide le token ────────────────────────────────────────
info "\n[10] POST /auth/logout"
LOGOUT=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST "$API/auth/logout" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" 2>/dev/null || echo "000")
[[ "$LOGOUT" == "200" || "$LOGOUT" == "204" ]] \
    && pass "POST /auth/logout → $LOGOUT" \
    || fail "POST /auth/logout → $LOGOUT"

# Vérifier que le token est bien invalidé
AFTER_LOGOUT=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$API/vehicles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/json" 2>/dev/null || echo "000")
[[ "$AFTER_LOGOUT" == "401" ]] \
    && pass "Token invalidé après logout (→ 401)" \
    || fail "Token encore valide après logout → $AFTER_LOGOUT (Sanctum ne révoque pas)"

fi  # end if TOKEN
fi  # end if credentials

# ── Test 11: Maintenance mode est OFF ────────────────────────────────────────
info "\n[11] Maintenance mode check"
MAINT=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "$API/health" 2>/dev/null || echo "000")
[[ "$MAINT" != "503" ]] \
    && pass "Pas en maintenance mode (→ $MAINT)" \
    || fail "App en maintenance mode (→ 503) — php artisan up"

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo -e " Résultats: ${GREEN}${PASS} passés${NC}  ${RED}${FAIL} échoués${NC}"
echo "═══════════════════════════════════════════════════"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
