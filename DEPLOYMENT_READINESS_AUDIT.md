# DriveFlow — Deployment Readiness Audit

**Date:** 2026-05-01  
**Auditeur:** Senior DevOps / Laravel Production Engineer  
**Périmètre:** Tous les fichiers `deploy/` + `HealthController.php`  
**Standard de référence:** OWASP, Mozilla SSL Configuration Generator (Intermediate), Laravel Security Best Practices

---

## Résumé exécutif

Les fichiers de déploiement constituent une base solide mais présentent **4 risques critiques bloquants**, **11 problèmes majeurs à corriger**, et **8 avertissements** avant tout passage en staging ou production.

**Deux bugs de script feront planter les tests de smoke et la checklist dès la première exécution** (bash arithmetic sous `set -e`). Le secret de bypass de maintenance est hardcodé dans git. La configuration SSL est sous-sécurisée. La location Nginx `/storage/` expose des documents sensibles sans authentification.

---

## Score par domaine

| # | Domaine | Statut | Sévérité |
|---|---------|--------|----------|
| 1 | Sécurité Nginx/Apache | À corriger | Critique + Majeur |
| 2 | Permissions storage | À corriger | Majeur |
| 3 | APP_KEY / APP_ENV / APP_DEBUG | OK avec réserves | Mineur |
| 4 | Queue worker / Supervisor | À corriger | Majeur |
| 5 | Laravel scheduler | OK avec réserves | Mineur |
| 6 | DB backup + restore | À corriger | Critique + Majeur |
| 7 | Rollback | À corriger | Critique |
| 8 | Smoke tests | À corriger | Critique (bug bash) |
| 9 | Variables .env manquantes | À corriger | Majeur |
| 10 | Exposition fichiers sensibles | Risque critique | Critique |
| 11 | SSL / HTTPS | À corriger | Majeur |
| 12 | CORS | À corriger | Majeur |
| 13 | Upload limits | À corriger | Mineur |
| 14 | Logs et monitoring | À corriger | Majeur |

---

## 1. Sécurité Nginx

### 1.1 — RISQUE CRITIQUE : `/storage/` exposé sans authentification

**Fichier:** `deploy/nginx.conf` ligne 37-41

```nginx
location /storage/ {
    alias /var/www/driveflow/backend/storage/app/public/;
    expires 1d;
    add_header Cache-Control "public, immutable";
}
```

**Problème :** Cette location sert directement `storage/app/public/` sans aucun contrôle d'accès. Dans DriveFlow, ce répertoire contient des documents KYC (pièces d'identité), photos, contrats signés, et relevés financiers. N'importe qui connaissant le nom d'un fichier peut le télécharger sans être authentifié.

**Ce qui doit se passer :** Les fichiers sensibles doivent être servis par Laravel (qui vérifie l'authentification et les permissions), pas directement par Nginx.

**Correction :**
Retirer complètement ce bloc de `nginx.conf`. Créer à la place un endpoint Laravel protégé par auth:sanctum :

```nginx
# SUPPRIMER ce bloc :
# location /storage/ {
#     alias /var/www/driveflow/backend/storage/app/public/;
# }
```

Dans Laravel, les téléchargements de fichiers sensibles passent par un contrôleur qui vérifie les droits. Seuls les assets vraiment publics (logos, assets frontend) peuvent être servis directement.

### 1.2 — Majeur : Headers Nginx sans `always` sur API

**Fichier:** `deploy/nginx.conf` lignes 27-31

```nginx
add_header X-Content-Type-Options  nosniff;
add_header X-Frame-Options         DENY;
```

**Problème :** Sans le flag `always`, les headers de sécurité ne sont pas ajoutés sur les réponses d'erreur (401, 403, 404, 500). Un attaquant recevant une erreur 401 ne verra pas les headers de sécurité.

**Correction :**
```nginx
add_header X-Content-Type-Options  nosniff always;
add_header X-Frame-Options         DENY always;
add_header X-XSS-Protection        "1; mode=block" always;
add_header Referrer-Policy         strict-origin-when-cross-origin always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Permissions-Policy      "geolocation=(), microphone=(), camera=()" always;
```

### 1.3 — Majeur : Regex protection fichiers sensibles — case-sensitive insuffisant

**Fichier:** `deploy/nginx.conf` ligne 58

```nginx
location ~ /\.(env|git|htaccess) { deny all; }
```

**Problème :** `~` est case-sensitive. `.ENV`, `.GIT`, `.Env` passeraient sur certains systèmes de fichiers. La regex ne couvre pas `composer.json`, `composer.lock` (exposent les versions de packages avec CVEs connus), ni `artisan`.

**Correction :**
```nginx
location ~* /\.(env|git|htaccess|gitignore|gitattributes)$ { deny all; }
location = /composer.json   { deny all; }
location = /composer.lock   { deny all; }
location = /artisan         { deny all; }
location ~* /vendor/        { deny all; }
```

### 1.4 — Majeur : Rate limiting absent sur les endpoints sensibles

**Fichier:** `deploy/nginx.conf`

Pas de `limit_req_zone` défini. Les endpoints `/api/v1/auth/login`, `/api/v1/auth/password`, et les webhooks sont exposés à la force brute et aux floods sans aucune limitation au niveau Nginx.

**Correction — ajouter en haut de nginx.conf :**
```nginx
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api:10m   rate=60r/m;
limit_conn_zone $binary_remote_addr zone=perip:10m;
```

**Dans le bloc server API :**
```nginx
location ~ ^/api/v1/auth/(login|password) {
    limit_req zone=login burst=3 nodelay;
    try_files $uri $uri/ /index.php?$query_string;
}

location /api/ {
    limit_req zone=api burst=20 nodelay;
    limit_conn perip 20;
    try_files $uri $uri/ /index.php?$query_string;
}
```

### 1.5 — Mineur : `server_tokens` expose la version Nginx

**Correction :** Ajouter dans le bloc `http {}` de `nginx.conf` (ou dans `/etc/nginx/nginx.conf`) :
```nginx
server_tokens off;
```

### 1.6 — Mineur : Pas de protection Slowloris

**Correction :** Ajouter dans les blocs `server {}` :
```nginx
client_body_timeout   12;
client_header_timeout 12;
keepalive_timeout     15;
send_timeout          10;
```

---

## 2. SSL / HTTPS

### 2.1 — Majeur : Configuration TLS sous-sécurisée (Nginx et Apache)

**Fichier:** `deploy/nginx.conf` ligne 24, `deploy/apache-vhost.conf` (aucune directive SSL)

**Nginx actuel :**
```nginx
ssl_ciphers HIGH:!aNULL:!MD5;
```

**Problème :** `HIGH` inclut 3DES (vulnérable à SWEET32), des ciphers sans forward secrecy, et des DH groups potentiellement à 1024-bit. Il manque `ssl_dhparam`, OCSP stapling, et `ssl_session_cache`.

**Apache actuel :** Aucune directive `SSLProtocol` ni `SSLCipherSuite` — Apache utilisera ses defaults qui peuvent inclure TLSv1 et TLSv1.1.

**Correction Nginx (Mozilla Intermediate — référence) :**
```nginx
ssl_protocols             TLSv1.2 TLSv1.3;
ssl_ciphers               ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache         shared:SSL:10m;
ssl_session_timeout       1d;
ssl_session_tickets       off;
ssl_dhparam               /etc/nginx/dhparam.pem;  # openssl dhparam -out /etc/nginx/dhparam.pem 2048
ssl_stapling              on;
ssl_stapling_verify       on;
resolver                  1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout          5s;
```

**Correction Apache :**
```apache
SSLProtocol             all -SSLv3 -TLSv1 -TLSv1.1
SSLCipherSuite          ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384
SSLHonorCipherOrder     off
SSLSessionTickets       off
SSLUseStapling          on
SSLStaplingCache        shmcb:/run/apache2/ssl_stapling(32768)
ServerTokens            Prod
ServerSignature         Off
```

**Commande à exécuter (génération DH params) :**
```bash
openssl dhparam -out /etc/nginx/dhparam.pem 2048
# Prend 1-2 minutes. Ne pas utiliser 4096 en production — trop lent.
```

---

## 3. Permissions storage/bootstrap/cache

### 3.1 — Majeur : chmod 775 trop permissif

**Fichier:** `deploy/deploy.sh` ligne 95

```bash
chmod -R 775 "$BACKEND/storage" "$BACKEND/bootstrap/cache"
```

**Problème :** `775` donne la permission d'écriture au groupe. Si un autre utilisateur système est dans le groupe `www-data` (ex: un développeur avec accès SSH), il peut modifier ou exfiltrer des fichiers dans `storage/`. En production, seul `www-data` doit écrire dans `storage/`.

**Correction :**
```bash
# Owner: www-data, group: www-data
chown -R www-data:www-data "$BACKEND/storage" "$BACKEND/bootstrap/cache"
# Répertoires: 755 (traverse mais pas écriture pour others)
find "$BACKEND/storage" -type d -exec chmod 755 {} \;
find "$BACKEND/bootstrap/cache" -type d -exec chmod 755 {} \;
# Fichiers: 644
find "$BACKEND/storage" -type f -exec chmod 644 {} \;
```

Note : `storage/logs/` peut rester à 755 si vous avez besoin de lire les logs en tant qu'autre utilisateur. Mais `storage/app/` (documents KYC) doit être 700 ou 750 maximum.

### 3.2 — Majeur : pre-deploy-checklist vérifie les permissions depuis le mauvais utilisateur

**Fichier:** `deploy/pre-deploy-checklist.sh` ligne 84-89

```bash
for DIR in "$BACKEND/storage" "$BACKEND/bootstrap/cache"; do
    if [[ -w "$DIR" ]]; then
```

**Problème :** `[[ -w "$DIR" ]]` teste si l'utilisateur **courant** (celui qui lance le script) peut écrire. Si le script est lancé en `root`, il dira toujours "Writable" même si `www-data` ne peut pas écrire. Faux positif systématique.

**Correction :**
```bash
for DIR in "$BACKEND/storage" "$BACKEND/bootstrap/cache"; do
    if sudo -u www-data test -w "$DIR" 2>/dev/null; then
        pass "Writable by www-data: $DIR"
    else
        fail "NOT writable by www-data: $DIR — chown www-data:www-data + chmod 755"
    fi
done
```

---

## 4. Queue worker / Supervisor

### 4.1 — Majeur : `stopwaitsecs` trop élevé bloque les deploys

**Fichier:** `deploy/runbook.md` — config Supervisor

```ini
stopwaitsecs=3600
```

**Problème :** Lors d'un deploy, Supervisor attend jusqu'à 3600 secondes (1h) pour que le worker courant termine son job avant de le redémarrer. Si un job long est en cours, le deploy est bloqué 1 heure. Avec `queue:restart`, le worker se relance après le job courant — `stopwaitsecs` protège contre un SIGKILL prématuré, mais 3600s est excessif.

**Correction :**
```ini
stopwaitsecs=300
```
Les jobs ne devraient pas dépasser 5 minutes. Si c'est le cas, refactoriser avec `--max-time=300` dans la commande worker et des jobs qui checkpointent.

### 4.2 — Majeur : Pas de `--queue` nommée — mélange de priorités

**Fichier:** `deploy/runbook.md`

```bash
command=php /var/www/driveflow/backend/artisan queue:work --sleep=3 --tries=3 --max-time=3600
```

Sans `--queue`, le worker consomme `default` queue. Si une notification urgente et un job de rapport comptable sont dans la même queue, les notifications peuvent attendre derrière des jobs lents.

**Correction :** Définir des queues nommées et des workers dédiés :
```bash
# Worker haute priorité (notifications, signatures)
command=php artisan queue:work --queue=critical,default --sleep=3 --tries=3 --max-time=3600

# Worker basse priorité (rapports, maintenance)
command=php artisan queue:work --queue=reports,maintenance --sleep=10 --tries=2 --max-time=3600
```

### 4.3 — Mineur : `--tries=3` sans délai exponentiel

Pour les jobs réseau (webhooks, mails), les retries immédiats échouent souvent pour la même raison. Ajouter dans les jobs concernés la méthode `backoff()` retournant `[60, 300, 900]`.

---

## 5. Laravel scheduler

### 5.1 — Mineur : Chemin PHP non versionné dans crontab

**Fichier:** `deploy/crontab.example`

```cron
* * * * * /usr/bin/php /var/www/driveflow/backend/artisan schedule:run
```

Sur Ubuntu/Debian, `/usr/bin/php` pointe vers la version par défaut PHP (peut être PHP 8.0 au lieu de 8.2).

**Correction :**
```cron
* * * * * /usr/bin/php8.2 /var/www/driveflow/backend/artisan schedule:run >> /var/log/driveflow-scheduler.log 2>&1
```

Vérifier : `which php8.2` ou `ls /usr/bin/php*`

### 5.2 — Mineur : Log du scheduler croît sans limite

`>> /var/log/driveflow-scheduler.log` sans rotation. En production, le scheduler tourne toutes les minutes = 1440 entrées/jour minimum.

**Correction :** Créer `/etc/logrotate.d/driveflow` :
```
/var/log/driveflow-scheduler.log
/var/log/driveflow-worker.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
```

---

## 6. DB backup + restore

### 6.1 — RISQUE CRITIQUE : Mot de passe MySQL exposé dans `ps aux`

**Fichier:** `deploy/pre-deploy-checklist.sh` ligne 108, `deploy/rollback.sh` ligne 68, `deploy/runbook.md` ligne 102

```bash
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT 1"
mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" | gzip > backup.sql.gz
```

**Problème :** Le mot de passe apparaît en clair dans `ps aux` pendant l'exécution. N'importe quel utilisateur du serveur peut le voir avec `ps aux | grep mysql`.

**Correction :** Utiliser un fichier d'options MySQL :
```bash
# Créer /etc/driveflow/mysql.cnf (root:root, chmod 600)
cat > /etc/driveflow/mysql.cnf <<EOF
[client]
host=${DB_HOST}
port=${DB_PORT}
user=${DB_USER}
password=${DB_PASS}
database=${DB_NAME}
EOF
chmod 600 /etc/driveflow/mysql.cnf

# Utiliser dans les scripts :
mysql --defaults-file=/etc/driveflow/mysql.cnf -e "SELECT 1"
mysqldump --defaults-file=/etc/driveflow/mysql.cnf | gzip > backup.sql.gz
```

### 6.2 — RISQUE CRITIQUE : Pas de backup automatique avant `migrate --force`

**Fichier:** `deploy/deploy.sh`

```bash
info "Running database migrations…"
$ARTISAN migrate --force
```

**Problème :** Si une migration échoue à mi-chemin (ex: ALTER TABLE sur 87 tables avec contraintes FK), la base est dans un état corrompu sans snapshot préalable.

**Correction — ajouter avant la migration :**
```bash
info "Backing up database before migration…"
BACKUP_FILE="/var/backups/driveflow/pre_deploy_${TIMESTAMP}.sql.gz"
mkdir -p /var/backups/driveflow
mysqldump --defaults-file=/etc/driveflow/mysql.cnf \
    --single-transaction --routines --triggers \
    | gzip > "$BACKUP_FILE"
[[ -f "$BACKUP_FILE" ]] && ok "Backup: $BACKUP_FILE" || fail "Backup FAILED — deploy aborted"
```

### 6.3 — Majeur : rollback.sh sélectionne le mauvais backup

**Fichier:** `deploy/rollback.sh` ligne 61

```bash
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1 || true)
```

**Problème :** `ls -t` sélectionne le fichier le plus récent par date de modification. Un backup nightly peut être plus récent que le backup pre-deploy si le rollback est déclenché le lendemain. On restaurerait alors le mauvais backup.

**Correction :** Passer le nom du backup explicitement au script :
```bash
# Appel : ./rollback.sh v0.9.5 /var/backups/driveflow/pre_deploy_20260501_140000.sql.gz
BACKUP_FILE="${3:-}"
[[ -n "$BACKUP_FILE" ]] || fail "Usage: $0 <TAG> [--db] <BACKUP_FILE>"
[[ -f "$BACKUP_FILE" ]] || fail "Backup file not found: $BACKUP_FILE"
```

### 6.4 — Majeur : grep DB_PASSWORD sans ancre dans runbook.md

**Fichier:** `deploy/runbook.md` ligne 98-100

```bash
DB_PASS=$(grep DB_PASSWORD /var/www/driveflow/backend/.env | cut -d= -f2)
DB_USER=$(grep DB_USERNAME /var/www/driveflow/backend/.env | cut -d= -f2)
```

**Problème :** `grep DB_PASSWORD` matchera `DB_PASSWORD_EXTRA=foo` s'il existe. Résultat inattendu silencieux.

**Correction :**
```bash
DB_PASS=$(grep -E '^DB_PASSWORD=' /var/www/driveflow/backend/.env | cut -d= -f2 | tr -d '"')
DB_USER=$(grep -E '^DB_USERNAME=' /var/www/driveflow/backend/.env | cut -d= -f2 | tr -d '"')
```

---

## 7. Rollback

### 7.1 — RISQUE CRITIQUE : `read` incompatible avec `set -e` en mode non-interactif

**Fichier:** `deploy/rollback.sh` ligne 38

```bash
set -euo pipefail
...
read -rp "Type 'rollback' to confirm: " CONFIRM
```

**Problème :** En mode non-interactif (CI, pipe, `bash rollback.sh < /dev/null`), `read` retourne exit code 1 quand stdin est fermé. Avec `set -e`, le script quitte immédiatement — sans message d'erreur, sans avoir demandé de confirmation, et SANS être entré dans le bloc de rollback. Comportement imprévisible selon l'environnement.

**Correction :**
```bash
if [[ -t 0 ]]; then
    read -rp "Type 'rollback' to confirm: " CONFIRM
    [[ "$CONFIRM" == "rollback" ]] || { echo "Aborted."; exit 1; }
else
    echo "Non-interactive mode — proceeding (called from automation)"
    # Ou : fail "Must be run interactively for safety"
fi
```

### 7.2 — RISQUE CRITIQUE : Rollback frontend bloquant — downtime étendu

**Fichier:** `deploy/rollback.sh` lignes 77-82

```bash
npm ci --prefer-offline
npm run build
```

**Problème :** `npm ci` + Vite build peut prendre 3-8 minutes. Pendant ce temps, le backend est en maintenance mais le frontend précédent ne sert plus les utilisateurs. Si le build échoue (npm registry timeout, mémoire insuffisante), le site reste cassé.

**Solution correcte :** Stocker les artifacts de build. Avant chaque deploy, sauvegarder `dist/` :

```bash
# Dans deploy.sh, avant npm run build :
cp -r "$FRONTEND/dist" "/var/backups/driveflow/dist_${PREVIOUS_TAG}" 2>/dev/null || true

# Dans rollback.sh, remplacer npm ci + build par :
DIST_BACKUP="/var/backups/driveflow/dist_${PREVIOUS_TAG}"
if [[ -d "$DIST_BACKUP" ]]; then
    rm -rf "$FRONTEND/dist"
    cp -r "$DIST_BACKUP" "$FRONTEND/dist"
    ok "Frontend restored from backup dist (instant)"
else
    warn "No dist backup found — rebuilding (slower)…"
    npm ci --prefer-offline && npm run build
fi
```

### 7.3 — Majeur : npm sur le serveur de production

**Fichier:** `deploy/deploy.sh` et `deploy/rollback.sh`

**Problème :** Node.js sur un serveur de production augmente la surface d'attaque, occupe de la mémoire, et peut être exploité via les dépendances npm. Le plan original (Phase 4) stipulait "On CI or build machine".

**Recommandation :** Build sur CI/CD (GitHub Actions, GitLab CI) → uploader `dist/` comme artifact → rsync vers le serveur prod. Si Node doit rester sur prod, l'isoler avec des permissions minimales.

---

## 8. Smoke tests

### 8.1 — RISQUE CRITIQUE : Bug bash — script se termine après le premier test

**Fichier:** `deploy/smoke-test.sh` lignes 15, 24-26

```bash
set -euo pipefail

PASS=0; FAIL=0

pass() { echo -e "  ${GREEN}PASS${NC}  $*"; ((PASS++)); }
fail() { echo -e "  ${RED}FAIL${NC}  $*"; ((FAIL++)); }
```

**Problème :** En bash avec `set -e`, l'expression arithmétique `((PASS++))` quand `PASS=0` évalue à `((0))` ce qui retourne exit code 1. `set -e` interprète cela comme une erreur et **termine le script immédiatement après le premier test passé.** Résultat : seul le premier test est exécuté, tous les suivants sont ignorés silencieusement.

**Même bug dans `deploy/pre-deploy-checklist.sh` lignes 18-20.**

**Correction dans les deux fichiers :**
```bash
pass() { echo -e "  ${GREEN}[PASS]${NC}  $*"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}[FAIL]${NC}  $*"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}[WARN]${NC}  $*"; WARN=$((WARN + 1)); }
```

### 8.2 — Majeur : Tests manquants dans smoke-test.sh

Les tests suivants sont absents et nécessaires pour DriveFlow :

| Test manquant | Pourquoi critique |
|---------------|-------------------|
| Headers CORS avec `Origin:` | Valide que Sanctum accepte le frontend origin |
| Upload fichier (multipart) | KYC, photos — la limite PHP + Nginx peut rejeter en silence |
| `POST /auth/logout` | Valide l'invalidation du token |
| GET contrat PDF | DomPDF en production — extension fileinfo requise |
| GET endpoint 401 sans token | Valide que les routes protégées rejettent sans auth |
| Vérification header HSTS | Certbot ou proxy peut ne pas avoir activé TLS |
| `POST` sur une ressource | Les reads passent mais CSRF peut bloquer les writes |

### 8.3 — Mineur : `set -euo pipefail` interagit avec `|| echo "CURL_FAIL"`

La combinaison `set -e` + `curl ... || echo "CURL_FAIL"` fonctionne correctement car le `||` gère l'exit code non-nul. Pas de bug ici, mais attention lors d'ajouts futurs.

---

## 9. Variables .env manquantes

### 9.1 — RISQUE CRITIQUE : `TRUSTED_PROXIES` absent

**Fichier:** `deploy/.env.production.example`

**Problème :** DriveFlow est derrière Nginx (reverse proxy). Sans `TRUSTED_PROXIES`, Laravel ne lira pas les headers `X-Forwarded-For` et `X-Forwarded-Proto`. Conséquences :
- `APP_URL` génère des URLs en `http://` même sur HTTPS
- `$request->secure()` retourne `false` → redirections infinies possibles
- Sanctum cookie auth peut refuser les requêtes HTTPS
- Les IPs dans les logs sont toujours `127.0.0.1` (l'IP de Nginx, pas du client)

**Correction — ajouter à `.env.production.example` :**
```dotenv
# ── Proxy / HTTPS ─────────────────────────────────────────────────────────────
# Si l'app est derrière Nginx/Apache/CDN (cas normal en prod)
TRUSTED_PROXIES=*              # ou l'IP exacte du proxy: 127.0.0.1,10.0.0.0/8
TRUSTED_HOSTS=api.driveflow.yourdomain.com,app.driveflow.yourdomain.com
```

### 9.2 — Majeur : Variables manquantes

| Variable manquante | Impact |
|--------------------|--------|
| `SESSION_SAME_SITE=lax` | Protection CSRF insuffisante sans SameSite cookie |
| `BCRYPT_ROUNDS=12` | La valeur par défaut peut être 10 selon la version Laravel — à expliciter |
| `LOG_MAX_FILES=30` | Daily log channel garde 14 fichiers par défaut — peut saturer le disque |
| `DB_COLLATION=utf8mb4_unicode_ci` | MySQL peut utiliser une collation différente, causant des problèmes avec les accents (noms clients marocains) |
| `APP_MAINTENANCE_STORE` | Sans `database`, le fichier `framework/down` peut ne pas être vu par les workers en maintenance mode |

**Correction — ajouter à `.env.production.example` :**
```dotenv
SESSION_SAME_SITE=lax
BCRYPT_ROUNDS=12
LOG_MAX_FILES=30
DB_COLLATION=utf8mb4_unicode_ci
```

### 9.3 — Majeur : Commentaires inline dans .env potentiellement dangereux

**Fichier:** `deploy/.env.production.example` ligne 9

```dotenv
APP_KEY=                        # REQUIRED: php artisan key:generate --show
DB_PASSWORD=                    # REQUIRED: strong random password
```

**Problème :** Si quelqu'un copie ce fichier et oublie de remplacer la valeur vide, `APP_KEY` reste vide. De plus, certains outils de déploiement (Ansible, sed, envsubst) peuvent mal interpréter les commentaires inline dans .env. Laravel DotEnv les gère correctement, mais c'est une source d'erreurs humaines.

**Recommandation :** Placer les commentaires sur la ligne précédente :
```dotenv
# REQUIRED: php artisan key:generate --show → coller le résultat ici
APP_KEY=
```

---

## 10. Exposition fichiers sensibles

### 10.1 — RISQUE CRITIQUE : Secret de bypass hardcodé dans git

**Fichier:** `deploy/deploy.sh` ligne 61

```bash
$ARTISAN down --secret="driveflow-deploy-bypass"
```

**Problème :** Ce secret permet à n'importe qui de bypasser la maintenance mode en ajoutant `?secret=driveflow-deploy-bypass` à l'URL. Il est commité en clair dans le dépôt git. N'importe qui avec accès au repo peut accéder à l'application pendant la maintenance.

**Correction :**
```bash
DEPLOY_SECRET="${DEPLOY_BYPASS_SECRET:-$(openssl rand -hex 16)}"
echo "Maintenance bypass secret: $DEPLOY_SECRET" | tee /var/log/deploy_secret_${TIMESTAMP}.log
$ARTISAN down --retry=10 --refresh=5 --secret="$DEPLOY_SECRET"
```

Stocker `DEPLOY_BYPASS_SECRET` dans les secrets CI/CD, pas dans le code.

### 10.2 — Majeur : `source .env` dans le runbook est dangereux

**Fichier:** `deploy/runbook.md` Phase 5

```bash
source .env
```

**Problème :** Bash évalue le `.env` comme du code shell. Un `.env` contenant `DB_PASSWORD=mon mot de passe` ferait exécuter `mot` comme commande. Pire, si `.env` contient `$()` ou des backticks, code injection est possible.

**Correction :** Ne jamais faire `source .env`. Utiliser grep avec ancres :
```bash
grep -E '^APP_(ENV|DEBUG)=' .env
grep -E '^APP_KEY=base64:' .env
grep -E '^SANCTUM_STATEFUL_DOMAINS=' .env
```

### 10.3 — Mineur : HealthController expose l'environnement

**Fichier:** `backend/app/Http/Controllers/Api/V1/HealthController.php` ligne 62

```php
'env' => config('app.env'),
```

**Problème :** Confirme à un attaquant que le système est en production et oriente ses attaques. Le health check est public (sans auth).

**Correction :** Retirer `env` de la réponse publique, ou le limiter à une IP de monitoring :
```php
// Supprimer cette ligne en production :
// 'env' => config('app.env'),
```

---

## 11. CORS

### 11.1 — Majeur : CORS non vérifié dans les scripts de déploiement

Aucun des scripts ne vérifie la configuration CORS (`config/cors.php`) ni que `SANCTUM_STATEFUL_DOMAINS` correspond exactement à l'origine du frontend sans trailing slash.

**Vérification à ajouter dans `pre-deploy-checklist.sh` :**
```bash
section "I. CORS Configuration"
CORS_ORIGINS=$(php "$BACKEND/artisan" tinker --execute="echo config('cors.allowed_origins')[0] ?? 'not_set';" 2>/dev/null || echo "error")
FRONTEND_URL=$(grep -E '^FRONTEND_URL=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' || echo "")
[[ "$CORS_ORIGINS" == "$FRONTEND_URL" ]] && pass "CORS origin matches FRONTEND_URL" || \
    warn "CORS origin ($CORS_ORIGINS) ≠ FRONTEND_URL ($FRONTEND_URL) — vérifier config/cors.php"
```

**Vérification à ajouter dans `smoke-test.sh` :**
```bash
info "\n[X] CORS headers"
CORS_RESP=$(curl -sf -I -X OPTIONS "$API/auth/login" \
    -H "Origin: $FRONTEND_ORIGIN" \
    -H "Access-Control-Request-Method: POST" 2>/dev/null || echo "CURL_FAIL")
echo "$CORS_RESP" | grep -qi "access-control-allow-origin" \
    && pass "CORS headers present" || fail "CORS headers missing on OPTIONS preflight"
```

### 11.2 — Majeur : Routes webhook exclues du CSRF ?

Les routes GPS et signature webhook reçoivent des requêtes POST de serveurs externes sans token CSRF. Vérifier que ces routes sont bien dans les exceptions du middleware CSRF dans `bootstrap/app.php` ou `App\Http\Middleware\VerifyCsrfToken`.

**Vérification manuelle requise :**
```bash
grep -n "webhook\|gps\|signature" /var/www/driveflow/backend/bootstrap/app.php
grep -n "VerifyCsrfToken\|except\|webhook" /var/www/driveflow/backend/app/Http/Middleware/*.php 2>/dev/null
```

---

## 12. Upload limits

### 12.1 — Mineur : Désynchronisation Nginx / PHP-FPM

**Fichier:** `deploy/nginx.conf` ligne 34

```nginx
client_max_body_size 50M;
```

PHP-FPM a ses propres limites dans `php.ini` ou le pool config. Si elles sont inférieures à 50M, Nginx accepte le body mais PHP le rejette avec une erreur 500 silencieuse (ou une réponse vide). Le pre-deploy-checklist vérifie `upload_max_filesize` via CLI PHP — mais la valeur PHP-FPM peut différer.

**Vérification correcte :**
```bash
# Via PHP-FPM (socket)
curl -sf http://localhost/api/v1/health | jq '.data.php'
# OU via un phpinfo() temporaire
php-fpm8.2 -i | grep -E 'upload_max_filesize|post_max_size'
```

**Config PHP-FPM à vérifier dans `/etc/php/8.2/fpm/php.ini` :**
```ini
upload_max_filesize = 50M
post_max_size = 55M       ; Doit être > upload_max_filesize
memory_limit = 256M
max_execution_time = 120
```

---

## 13. APP_KEY / APP_ENV / APP_DEBUG

### 13.1 — OK avec réserve : Validation APP_KEY insuffisante

**Fichier:** `deploy/deploy.sh` ligne 49

```bash
APP_KEY=$(grep -E '^APP_KEY=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' || true)
[[ -n "$APP_KEY" ]] || fail "APP_KEY is not set"
```

Vérifie seulement que la variable n'est pas vide. Une valeur `APP_KEY=bonjour` passerait le test mais cassera Laravel (la clé doit commencer par `base64:`).

**Correction :**
```bash
APP_KEY=$(grep -E '^APP_KEY=' "$BACKEND/.env" | cut -d= -f2 | tr -d '"' || true)
[[ "$APP_KEY" =~ ^base64: ]] || fail "APP_KEY invalide — doit commencer par 'base64:' (php artisan key:generate --show)"
```

---

## 14. Logs et monitoring

### 14.1 — Majeur : Pas d'alerting externe configuré

Le runbook décrit uniquement la consultation manuelle des logs. Il n'y a aucune intégration avec un système d'alerting (Sentry, Papertrail, UptimeRobot, Slack webhook, PagerDuty).

**Minimum requis pour production :**
```bash
# Sentry (Laravel) — ajouter dans .env.production.example :
SENTRY_LARAVEL_DSN=https://xxx@sentry.io/yyy

# UptimeRobot — moniteur HTTP sur /api/v1/health (intervalle 5 min)
# Alerter si status != 200 ou si response body contient "degraded"
```

**Correction — ajouter à `.env.production.example` :**
```dotenv
# ── Monitoring ────────────────────────────────────────────────────────────────
SENTRY_LARAVEL_DSN=             # RECOMMANDÉ pour la production
LOG_SLACK_WEBHOOK_URL=          # Optionnel : alertes Slack sur erreurs critiques
```

### 14.2 — Mineur : `watch -n 600` dans le runbook ne fonctionne pas

**Fichier:** `deploy/runbook.md` ligne 185

```bash
watch -n 600 "php /var/www/driveflow/backend/artisan queue:failed | wc -l"
```

`watch` n'accepte pas des intervalles aussi grands sur certains systèmes (max souvent 86400). Et `watch` bloque le terminal — pas utilisable en monitoring continu.

**Correction :** Utiliser un cron ou un script de monitoring dédié :
```bash
# /etc/cron.d/driveflow-monitor
*/10 * * * * www-data php /var/www/driveflow/backend/artisan queue:failed | wc -l | \
    xargs -I{} bash -c 'if [ {} -gt 5 ]; then echo "DriveFlow: {} failed jobs" | mail -s "ALERT" ops@company.com; fi'
```

---

## Corrections appliquées immédiatement (fichiers à modifier)

Les corrections ci-dessous doivent être appliquées **avant tout deploy staging** :

### smoke-test.sh et pre-deploy-checklist.sh — Bug bash `((N++))` avec `set -e`

Les deux fichiers doivent remplacer :
```bash
pass() { ...; ((PASS++)); }
fail() { ...; ((FAIL++)); }
warn() { ...; ((WARN++)); }
```
par :
```bash
pass() { ...; PASS=$((PASS + 1)); }
fail() { ...; FAIL=$((FAIL + 1)); }
warn() { ...; WARN=$((WARN + 1)); }
```

### deploy.sh — Backup avant migration

Ajouter avant `$ARTISAN migrate --force` :
```bash
info "Backing up database before migration…"
BACKUP_FILE="/var/backups/driveflow/pre_deploy_${TIMESTAMP}.sql.gz"
mkdir -p /var/backups/driveflow
mysqldump --defaults-file=/etc/driveflow/mysql.cnf \
    --single-transaction --routines --triggers \
    | gzip > "$BACKUP_FILE" \
    && ok "Backup: $BACKUP_FILE" \
    || fail "Backup failed — deploy aborted for safety"
```

### deploy.sh — Secret de bypass

Remplacer :
```bash
$ARTISAN down --retry=10 --refresh=5 --secret="driveflow-deploy-bypass"
```
par :
```bash
DEPLOY_SECRET="${DEPLOY_BYPASS_SECRET:-$(openssl rand -hex 16)}"
echo "Bypass secret ce deploy: $DEPLOY_SECRET"
$ARTISAN down --retry=10 --refresh=5 --secret="$DEPLOY_SECRET"
```

### nginx.conf — Supprimer la location /storage/ exposée

```nginx
# SUPPRIMER ou remplacer par :
location /storage/ {
    deny all;
    return 403;
}
```

---

## Commandes à exécuter sur le serveur (ordre)

```bash
# 1. Générer DH params TLS
openssl dhparam -out /etc/nginx/dhparam.pem 2048

# 2. Créer fichier credentials MySQL (évite le mot de passe dans ps aux)
mkdir -p /etc/driveflow && chmod 700 /etc/driveflow
DB_USER=$(grep -E '^DB_USERNAME=' /var/www/driveflow/backend/.env | cut -d= -f2 | tr -d '"')
DB_PASS=$(grep -E '^DB_PASSWORD=' /var/www/driveflow/backend/.env | cut -d= -f2 | tr -d '"')
DB_HOST=$(grep -E '^DB_HOST='     /var/www/driveflow/backend/.env | cut -d= -f2 | tr -d '"')
DB_NAME=$(grep -E '^DB_DATABASE=' /var/www/driveflow/backend/.env | cut -d= -f2 | tr -d '"')
cat > /etc/driveflow/mysql.cnf <<EOF
[client]
host=$DB_HOST
port=3306
user=$DB_USER
password=$DB_PASS
database=$DB_NAME
EOF
chmod 600 /etc/driveflow/mysql.cnf

# 3. Créer logrotate DriveFlow
cat > /etc/logrotate.d/driveflow <<'EOF'
/var/log/driveflow-scheduler.log
/var/log/driveflow-worker.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
    copytruncate
}
EOF

# 4. Vérifier la collation MySQL
mysql --defaults-file=/etc/driveflow/mysql.cnf -e \
    "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='driveflow_db';"

# 5. Vérifier les limites PHP-FPM
php-fpm8.2 -i 2>/dev/null | grep -E 'upload_max_filesize|post_max_size|memory_limit'

# 6. Vérifier CORS exclusions CSRF (webhooks)
grep -rn "webhook\|except" /var/www/driveflow/backend/bootstrap/app.php

# 7. Test SSL après deploy (depuis une autre machine)
curl -I --http2 https://api.driveflow.yourdomain.com/api/v1/health
openssl s_client -connect api.driveflow.yourdomain.com:443 -brief 2>&1 | head -5
```

---

## Récapitulatif des problèmes

### Risques critiques bloquants (4)

| # | Fichier | Problème |
|---|---------|---------|
| C1 | `nginx.conf` | `/storage/` expose les documents KYC sans authentification |
| C2 | `smoke-test.sh` + `pre-deploy-checklist.sh` | Bug bash `((N++))` avec `set -e` — les tests ne s'exécutent pas |
| C3 | `deploy.sh` | Pas de backup automatique avant `migrate --force` |
| C4 | `deploy.sh` | Secret de bypass maintenance hardcodé en clair dans git |

### Problèmes majeurs (11)

| # | Fichier | Problème |
|---|---------|---------|
| M1 | `nginx.conf` + `apache-vhost.conf` | TLS sous-sécurisé (ciphers faibles, pas de DH params, pas d'OCSP stapling) |
| M2 | `nginx.conf` | Headers sécurité sans `always` — absents sur les erreurs 4xx/5xx |
| M3 | `nginx.conf` | Pas de rate limiting — exposition brute force login |
| M4 | `deploy.sh` | `chmod 775` trop permissif sur storage |
| M5 | `pre-deploy-checklist.sh` | Vérification permissions depuis le mauvais utilisateur (pas www-data) |
| M6 | `rollback.sh` | `read` incompatible avec `set -e` en non-interactif — comportement imprévisible |
| M7 | `rollback.sh` | Frontend rebuild pendant rollback = downtime 5-10 min, sans fallback si build échoue |
| M8 | `rollback.sh` | Sélection du backup par date mtime — peut restaurer le mauvais snapshot |
| M9 | Tous les scripts | Mot de passe MySQL exposé dans `ps aux` |
| M10 | `.env.production.example` | `TRUSTED_PROXIES` absent — URLs en http://, Sanctum cassé derrière proxy |
| M11 | `runbook.md` | `source .env` est dangereux — injection shell possible |

### Avertissements (8)

| # | Problème |
|---|---------|
| W1 | `ssl_ciphers HIGH` inclut 3DES — SWEET32 potentiel |
| W2 | `server_tokens` non configuré — version Nginx exposée |
| W3 | `stopwaitsecs=3600` Supervisor — deploy bloqué 1h si job long en cours |
| W4 | `/usr/bin/php` dans crontab non versionné — peut pointer vers PHP 8.0 |
| W5 | APP_KEY validation — n'exige pas le format `base64:` |
| W6 | `SESSION_SAME_SITE` absent du .env production |
| W7 | `DB_COLLATION` absent — risque d'encodage sur noms marocains (accents, caractères arabes) |
| W8 | `env` dans la réponse HealthController — confirme l'environnement à un attaquant |

---

## Décision finale

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   STAGING  :  NOT READY                             │
│   PRODUCTION: NOT READY                             │
│                                                     │
│   4 risques critiques doivent être corrigés         │
│   avant le premier deploy staging.                  │
│                                                     │
│   Durée estimée de correction : 1 journée           │
│   (les 4 critiques + les 4 majeurs bloquants)       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Conditions minimales pour staging :**
1. ✅ Corriger le bug bash `((N++))` dans smoke-test.sh et pre-deploy-checklist.sh
2. ✅ Supprimer la location `/storage/` de nginx.conf
3. ✅ Ajouter le backup DB automatique avant `migrate --force` dans deploy.sh
4. ✅ Externaliser le secret de bypass maintenance
5. ✅ Ajouter `TRUSTED_PROXIES` dans .env production
6. ✅ Corriger `mysql -p"$PASS"` → `--defaults-file`

**Conditions supplémentaires pour production (après staging validé) :**
- TLS durci (DH params, OCSP stapling, ciphers Mozilla Intermediate)
- Rate limiting Nginx sur les endpoints auth
- Alerting externe (Sentry minimum)
- Rollback frontend avec artifact de dist/ sauvegardé
- `chmod 755` au lieu de `775` sur storage
- Vérification CORS dans smoke tests
