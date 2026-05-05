# DriveFlow — Production Operations Runbook

> **Audience:** On-call engineer / DevOps  
> **Scope:** Post–go-live first 48 h + recurring ops  
> **Last updated:** 2026-05-01  

---

## Quick Reference

| Task | Command |
|------|---------|
| Health check | `curl https://api.driveflow.yourdomain.com/api/v1/health` |
| Deploy | `sudo -u www-data bash deploy/deploy.sh v1.x.x` |
| Rollback | `sudo -u www-data bash deploy/rollback.sh v1.x.x` |
| Smoke tests | `SMOKE_EMAIL=admin@… SMOKE_PASSWORD=… bash deploy/smoke-test.sh` |
| Maintenance ON | `php /var/www/driveflow/backend/artisan down` |
| Maintenance OFF | `php /var/www/driveflow/backend/artisan up` |
| Tail app log | `tail -f /var/www/driveflow/backend/storage/logs/laravel.log` |
| Tail queue log | `sudo journalctl -u driveflow-worker -f` |
| Restart workers | `php /var/www/driveflow/backend/artisan queue:restart` |
| Failed jobs | `php /var/www/driveflow/backend/artisan queue:failed` |
| Retry failed job | `php /var/www/driveflow/backend/artisan queue:retry <id>` |
| Clear all caches | `php /var/www/driveflow/backend/artisan optimize:clear` |

---

## Server Layout

```
/var/www/driveflow/
├── backend/              Laravel 12 (PHP 8.2+)
│   ├── public/           Web root — point Nginx/Apache here
│   ├── storage/          Writable by www-data
│   └── .env              Production secrets (never in git)
├── frontend/
│   └── dist/             Built SPA — served as static files
└── deploy/               This runbook + scripts
/var/backups/driveflow/   DB dumps (nightly cron)
/var/log/driveflow-*.log  Scheduler / queue logs
```

---

## Phase 1 — One-time Server Setup

### PHP extensions required
```bash
php -m | grep -E 'pdo_mysql|mbstring|openssl|tokenizer|xml|ctype|json|fileinfo|gd'
# Missing? On Ubuntu: sudo apt install php8.2-{mysql,mbstring,xml,gd,curl,zip}
```

### Storage permissions
```bash
sudo chown -R www-data:www-data /var/www/driveflow/backend/storage
sudo chown -R www-data:www-data /var/www/driveflow/backend/bootstrap/cache
sudo chmod -R 775 /var/www/driveflow/backend/storage
sudo chmod -R 775 /var/www/driveflow/backend/bootstrap/cache
```

### Symlink storage → public (for file downloads)
```bash
php /var/www/driveflow/backend/artisan storage:link
```

### Queue worker with Supervisor
```bash
# /etc/supervisor/conf.d/driveflow-worker.conf
[program:driveflow-worker]
command=php /var/www/driveflow/backend/artisan queue:work --sleep=3 --tries=3 --max-time=3600
directory=/var/www/driveflow/backend
user=www-data
numprocs=2
autostart=true
autorestart=true
stopwaitsecs=3600
stdout_logfile=/var/log/driveflow-worker.log
redirect_stderr=true
```
```bash
sudo supervisorctl reread && sudo supervisorctl update && sudo supervisorctl start driveflow-worker:*
```

### Cron (Laravel scheduler)
```bash
sudo crontab -u www-data -e
# Paste content from deploy/crontab.example
# Verify:
sudo crontab -u www-data -l
```

---

## Phase 2 — Database

### Pre-deploy backup (run before every deploy)
```bash
DB_PASS=$(grep DB_PASSWORD /var/www/driveflow/backend/.env | cut -d= -f2)
DB_USER=$(grep DB_USERNAME /var/www/driveflow/backend/.env | cut -d= -f2)
DB_NAME=$(grep DB_DATABASE /var/www/driveflow/backend/.env | cut -d= -f2)
mkdir -p /var/backups/driveflow
mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  | gzip > "/var/backups/driveflow/pre_deploy_$(date +%Y%m%d_%H%M%S).sql.gz"
```

### Verify restore on staging (before first prod deploy)
```bash
zcat /var/backups/driveflow/pre_deploy_YYYYMMDD_HHMMSS.sql.gz \
  | mysql -u staging_user -pSECRET driveflow_staging
```

### Spot-check critical FKs after migration
```sql
-- Run in MySQL after migrate
SELECT COUNT(*) FROM contracts WHERE vehicle_id NOT IN (SELECT id FROM vehicles);
SELECT COUNT(*) FROM invoice_items WHERE invoice_id NOT IN (SELECT id FROM invoices);
SELECT COUNT(*) FROM accounting_entries WHERE journal_id NOT IN (SELECT id FROM accounting_journals);
-- All should return 0
```

### First-deploy seeders (RBAC + Moroccan chart of accounts)
```bash
php /var/www/driveflow/backend/artisan db:seed --class=RbacSeeder --force
php /var/www/driveflow/backend/artisan driveflow:seed-accounting
```

---

## Phase 5 — Config Verification Checklist

Run after deploy, before smoke tests:

```bash
cd /var/www/driveflow/backend
source .env

# 1. APP_ENV=production, APP_DEBUG=false
grep -E '^APP_(ENV|DEBUG)=' .env

# 2. APP_KEY is set
grep '^APP_KEY=base64:' .env | wc -c  # must be > 10

# 3. SANCTUM_STATEFUL_DOMAINS matches frontend origin
grep '^SANCTUM_STATEFUL_DOMAINS=' .env

# 4. Mail is real (not log driver)
grep '^MAIL_MAILER=' .env  # must NOT be "log"

# 5. Scheduler is registered in crontab
sudo crontab -u www-data -l | grep schedule:run

# 6. PHP upload_max_filesize
php -r "echo ini_get('upload_max_filesize');"  # should be 50M or more

# 7. Storage symlink
ls -la /var/www/driveflow/backend/public/storage  # must be a symlink
```

---

## Phase 6 — Smoke Tests

```bash
# Full smoke suite (replace credentials)
export SMOKE_EMAIL="admin@yourcompany.com"
export SMOKE_PASSWORD="your-admin-password"
bash /var/www/driveflow/deploy/smoke-test.sh https://api.driveflow.yourdomain.com/api/v1

# Quick health only
curl -s https://api.driveflow.yourdomain.com/api/v1/health | jq .
```

---

## Phase 8 — First 48 Hours Monitoring

### What to watch
```bash
# HTTP 5xx rate (Nginx)
tail -f /var/log/nginx/driveflow-api-error.log | grep " 5[0-9][0-9] "

# Queue failures
php /var/www/driveflow/backend/artisan queue:failed
# Auto-check every 10 min:
watch -n 600 "php /var/www/driveflow/backend/artisan queue:failed | wc -l"

# Slow queries (MySQL general log — enable temporarily)
# SET GLOBAL slow_query_log = 'ON'; SET GLOBAL long_query_time = 2;

# Disk on storage
df -h /var/www/driveflow/backend/storage

# Scheduler ran (check log)
tail -20 /var/log/driveflow-scheduler.log
```

### Signature webhook — verify receipt
```bash
# After a real or test signing event, check:
grep -i "signature" /var/www/driveflow/backend/storage/logs/laravel.log | tail -20
```

### Payment allocation errors
```bash
grep -i "payment\|allocation\|accounting" /var/www/driveflow/backend/storage/logs/laravel.log \
  | grep -i "error\|exception" | tail -20
```

---

## Incident Playbooks

### P0 — Site completely down (503 / unreachable)

1. `curl -I https://api.driveflow.yourdomain.com/api/v1/health`
2. Check Nginx: `systemctl status nginx` → `nginx -t`
3. Check PHP-FPM: `systemctl status php8.2-fpm`
4. Check app in maintenance mode: `cat /var/www/driveflow/backend/storage/framework/down`
   - If exists: `php artisan up` to remove
5. Check DB: `mysql -u driveflow_user -p driveflow_db -e "SELECT 1"`
6. If nothing works → rollback: `bash deploy/rollback.sh <PREVIOUS_TAG>`

### P1 — Signature webhook not receiving

1. Verify public HTTPS endpoint reachable: `curl -I https://api.driveflow.yourdomain.com/api/v1/signature/webhook`
2. Check HMAC secret matches provider dashboard: `grep YOUSIGN_WEBHOOK_SECRET /var/www/driveflow/backend/.env`
3. Check logs: `grep -i webhook /var/www/driveflow/backend/storage/logs/laravel.log | tail -30`
4. Disable provider temporarily: set `SIGNATURE_PROVIDER=internal` + `SIGNATURE_ALLOW_INTERNAL_OUTSIDE_DEV=true` in .env → `php artisan config:cache`

### P2 — Queue workers stopped processing

1. `php artisan queue:failed` — check for repeated failures
2. `sudo supervisorctl status driveflow-worker` — restart if stopped: `sudo supervisorctl restart driveflow-worker:*`
3. `php artisan queue:retry all` — retry all failed jobs (after fixing root cause)
4. Flush failed jobs if irrelevant: `php artisan queue:flush`

### P3 — Scheduler not running

1. `sudo crontab -u www-data -l` — confirm cron entry exists
2. `php artisan schedule:list` — confirm commands are registered
3. Manual trigger: `php /var/www/driveflow/backend/artisan driveflow:check-maintenance-due`
4. Check scheduler log: `tail -20 /var/log/driveflow-scheduler.log`

---

## Rollback Decision Tree

```
Deploy failed or post-deploy incidents?
├─ Code error (no DB change) → redeploy previous tag (no --db)
├─ Migration added bad data   → forward-fix migration preferred
│                               Last resort: rollback.sh <PREV_TAG> --db
└─ Frontend broken            → rebuild dist from previous tag + rsync to /dist
```

**Rollback approver:** [Define name/role]  
**Max downtime SLA:** [Define, e.g. 30 min]  
**Emergency contact:** [Name, phone/Slack]

---

## Release Tagging

```bash
# Before deploy — create and push a release tag
git tag -a v1.0.0-rc1 -m "Release candidate 1 — UAT signed off"
git push origin v1.0.0-rc1

# After successful go-live
git tag -a v1.0.0 -m "Production go-live 2026-05-xx"
git push origin v1.0.0
```
