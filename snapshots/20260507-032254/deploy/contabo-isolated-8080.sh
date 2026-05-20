#!/usr/bin/env bash
set -euo pipefail

# DriveFlow isolated staging deploy for Contabo
# - Does NOT modify existing default site
# - Creates a NEW nginx server block on :8080
# - Deploy root: /var/www/driveflow

IP="${IP:-79.143.180.186}"
APP_ROOT="${APP_ROOT:-/var/www/driveflow}"
BACKEND="$APP_ROOT/backend"
FRONTEND="$APP_ROOT/frontend"
NGX_SITE="/etc/nginx/sites-available/driveflow"
NGX_LINK="/etc/nginx/sites-enabled/driveflow"
PHP_FPM_SOCK="${PHP_FPM_SOCK:-/run/php/php8.2-fpm.sock}"
DB_NAME="${DB_NAME:-driveflow_db}"
DB_USER="${DB_USER:-driveflow_user}"
DB_PASS="${DB_PASS:-change_me}"
REPO_URL="${REPO_URL:-https://github.com/Oussama1002/malysia-car.git}"
BRANCH="${BRANCH:-main}"

log() { echo "[deploy] $*"; }
die() { echo "[deploy][ERROR] $*" >&2; exit 1; }

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run as root (sudo -i)."
}

install_base() {
  log "Installing/verifying base packages..."
  apt update
  apt install -y nginx mysql-server supervisor unzip git curl ca-certificates software-properties-common ufw
  add-apt-repository ppa:ondrej/php -y
  apt update
  apt install -y php8.2 php8.2-fpm php8.2-cli php8.2-mysql php8.2-mbstring php8.2-xml php8.2-curl php8.2-zip php8.2-gd php8.2-bcmath php8.2-intl php8.2-fileinfo
  if ! command -v composer >/dev/null 2>&1; then
    curl -sS https://getcomposer.org/installer | php
    mv composer.phar /usr/local/bin/composer
  fi
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | tr -d 'v' | cut -d. -f1)" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
  fi
}

inspect_existing_nginx() {
  log "Inspecting current nginx sites (read-only)..."
  ls -la /etc/nginx/sites-enabled || true
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    log "Found existing default site (untouched)."
  fi
}

prepare_code() {
  log "Preparing code at $APP_ROOT..."
  mkdir -p /var/www
  if [[ -d "$APP_ROOT/.git" ]]; then
    log "Existing git repo found, pulling latest branch $BRANCH..."
    git -C "$APP_ROOT" fetch --all --tags
    git -C "$APP_ROOT" checkout "$BRANCH"
    git -C "$APP_ROOT" pull --ff-only origin "$BRANCH"
  else
    rm -rf "$APP_ROOT"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_ROOT"
  fi
}

configure_mysql() {
  log "Configuring MySQL database/user..."
  mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
}

configure_backend_env() {
  log "Configuring backend .env..."
  [[ -f "$BACKEND/.env" ]] || cp "$BACKEND/.env.example" "$BACKEND/.env"
  sed -i "s|^APP_ENV=.*|APP_ENV=production|g" "$BACKEND/.env"
  sed -i "s|^APP_DEBUG=.*|APP_DEBUG=false|g" "$BACKEND/.env"
  sed -i "s|^APP_URL=.*|APP_URL=http://${IP}:8080|g" "$BACKEND/.env"
  sed -i "s|^DB_CONNECTION=.*|DB_CONNECTION=mysql|g" "$BACKEND/.env"
  sed -i "s|^DB_HOST=.*|DB_HOST=127.0.0.1|g" "$BACKEND/.env"
  sed -i "s|^DB_PORT=.*|DB_PORT=3306|g" "$BACKEND/.env"
  sed -i "s|^DB_DATABASE=.*|DB_DATABASE=${DB_NAME}|g" "$BACKEND/.env"
  sed -i "s|^DB_USERNAME=.*|DB_USERNAME=${DB_USER}|g" "$BACKEND/.env"
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASS}|g" "$BACKEND/.env"
  sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=http://${IP}:8080|g" "$BACKEND/.env"
  sed -i "s|^SANCTUM_STATEFUL_DOMAINS=.*|SANCTUM_STATEFUL_DOMAINS=${IP}:8080,${IP}|g" "$BACKEND/.env"
}

deploy_backend() {
  log "Deploying backend..."
  cd "$BACKEND"
  composer install --no-dev --optimize-autoloader --no-interaction
  if ! grep -q '^APP_KEY=base64:' .env; then
    php artisan key:generate --force
  fi
  php artisan migrate --force
  php artisan db:seed --force
  php artisan storage:link || true
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache
  chown -R www-data:www-data "$BACKEND/storage" "$BACKEND/bootstrap/cache"
  chmod -R 775 "$BACKEND/storage" "$BACKEND/bootstrap/cache"
}

deploy_frontend() {
  log "Deploying frontend..."
  cat > "$FRONTEND/.env.production" <<EOF
VITE_API_BASE=http://${IP}:8080/api
VITE_DEMO_MODE=false
VITE_ALLOW_MOCK_FALLBACK=false
VITE_SHOW_EXPERIMENTAL=false
VITE_ENABLE_REAL_DASHBOARD=true
EOF
  cd "$FRONTEND"
  npm ci
  npm run build
}

write_nginx_site() {
  log "Writing isolated nginx server block on :8080..."
  cat > "$NGX_SITE" <<EOF
server {
    listen 8080;
    server_name ${IP};
    client_max_body_size 50M;

    root ${FRONTEND}/dist;
    index index.html;

    location ~ /\\. {
        deny all;
        return 404;
    }

    location ~* /(vendor|storage|bootstrap|database|resources|routes|tests|\\.env|composer\\.(json|lock)|artisan) {
        deny all;
        return 404;
    }

    location ^~ /api {
        root ${BACKEND}/public;
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ ^/index\\.php(/|\$) {
        root ${BACKEND}/public;
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:${PHP_FPM_SOCK};
        fastcgi_param SCRIPT_FILENAME ${BACKEND}/public/index.php;
        internal;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)\$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript application/xml+rss image/svg+xml;
}
EOF

  [[ -L "$NGX_LINK" ]] || ln -s "$NGX_SITE" "$NGX_LINK"
  nginx -t
  systemctl reload nginx
}

configure_supervisor_and_cron() {
  log "Configuring supervisor queue worker..."
  cat > /etc/supervisor/conf.d/driveflow-worker.conf <<EOF
[program:driveflow-worker]
command=php ${BACKEND}/artisan queue:work --sleep=3 --tries=3 --max-time=3600
directory=${BACKEND}
user=www-data
autostart=true
autorestart=true
stdout_logfile=/var/log/driveflow-worker.log
redirect_stderr=true
EOF
  supervisorctl reread
  supervisorctl update
  supervisorctl restart driveflow-worker:* || supervisorctl start driveflow-worker:*

  log "Configuring scheduler cron..."
  (crontab -u www-data -l 2>/dev/null | grep -v "artisan schedule:run"; echo "* * * * * php ${BACKEND}/artisan schedule:run >> /var/log/driveflow-scheduler.log 2>&1") | crontab -u www-data -
}

firewall_rules() {
  log "Applying minimal firewall rules..."
  ufw allow OpenSSH
  ufw allow 80
  ufw allow 443
  ufw allow 8080
  ufw --force enable
}

verify() {
  log "Verifying old site + DriveFlow staging..."
  curl -sS -I "http://${IP}" | head -n 1 || true
  curl -sS "http://${IP}:8080/api/v1/health" || true
  curl -sS -I "http://${IP}:8080" | head -n 1 || true
}

main() {
  require_root
  inspect_existing_nginx
  install_base
  prepare_code
  configure_mysql
  configure_backend_env
  deploy_backend
  deploy_frontend
  write_nginx_site
  configure_supervisor_and_cron
  firewall_rules
  verify
  log "Done. DriveFlow isolated staging should be on http://${IP}:8080"
}

main "$@"
