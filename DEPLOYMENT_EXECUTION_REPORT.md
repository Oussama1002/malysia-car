# DriveFlow — Deployment Execution Report

**Date d'exécution** : 2026-05-05
**Opérateur** : Cursor Agent + propriétaire VPS
**Résultat global** : ✅ **SUCCESS** — DriveFlow déployé en isolation, projet existant intact, login admin fonctionnel.

---

## 1. Cible

| Item | Valeur |
|---|---|
| Serveur (Contabo VPS) | `79.143.180.186` (`vmi3261580`) |
| OS | Ubuntu 24.04 (noble) |
| Mode déploiement | **isolated staging** (port `8080`) |
| URL Frontend DriveFlow | http://79.143.180.186:8080 |
| URL API health | http://79.143.180.186:8080/api/v1/health |
| Chemin de déploiement | `/var/www/driveflow` |
| Branche déployée | `main` (origin: https://github.com/Oussama1002/malysia-car) |

---

## 2. Protection du projet existant (`paulbert`)

| Vérification | Résultat |
|---|---|
| Inspection des sites nginx avant déploiement | ✅ OUI (lecture seule) |
| Site par défaut nginx modifié | ❌ NON |
| Site `paulbert` modifié | ❌ NON |
| Services existants stoppés | ❌ NON |
| Répertoires existants réutilisés | ❌ NON |
| `paulbert` toujours accessible après déploiement | ✅ OUI |
| URL existante vérifiée `http://79.143.180.186/` | ✅ HTTP/1.1 200 OK |

**Preuve** :
```
$ sudo ss -tlnp | grep -E ':(80|8080)\s'
LISTEN 0  511  0.0.0.0:8080  ...  nginx (driveflow)
LISTEN 0  511  0.0.0.0:80    ...  nginx (paulbert)
```

DriveFlow est servi exclusivement sur `:8080`. Aucune ressource du projet `paulbert` n'a été touchée.

---

## 3. Stack installée / vérifiée

| Composant | Version |
|---|---|
| Nginx | `1.24.0 (Ubuntu)` |
| PHP CLI | `8.2.30` |
| PHP-FPM | `8.2 (php8.2-fpm.sock)` |
| Composer | (présent, dépendances installées via lockfile) |
| Node.js | `20.x` (NodeSource) |
| npm | (fourni avec Node 20) |
| MySQL Server | `8.0.45-0ubuntu0.24.04.1` |
| Supervisor | `4.2.5-1ubuntu0.1` |
| Laravel | `12.58.0` |

---

## 4. Base de données

| Item | Valeur |
|---|---|
| Hôte | `127.0.0.1:3306` |
| Database | `driveflow_db` |
| User | `driveflow_user` |
| Migrations | ✅ OUI — **60 migrations** exécutées avec succès |
| Seeders | ✅ OUI — `RbacSeeder` exécuté (10 rôles système, 211 permissions) |

**Preuve health check** :
```json
{"success":true,"data":{"status":"ok","app":"DriveFlow API","version":"1","env":"production","php":"8.2.30","laravel":"12.58.0","checks":{"database":"ok","queue":"ok","storage":"ok","app_key":"ok"},"time":"2026-05-05T12:34:13+00:00"}}
```

---

## 5. Configuration d'environnement

### Backend (`/var/www/driveflow/backend/.env`)

| Variable | Valeur |
|---|---|
| `APP_ENV` | `production` ✅ |
| `APP_DEBUG` | `false` ✅ |
| `APP_URL` | `http://79.143.180.186:8080` ✅ |
| `APP_KEY` | généré via `php artisan key:generate` ✅ |
| `DB_HOST` | `127.0.0.1` ✅ |
| `DB_DATABASE` | `driveflow_db` ✅ |
| `DB_USERNAME` | `driveflow_user` ✅ |
| `DB_PASSWORD` | (set, non commité) ✅ |
| `SANCTUM_STATEFUL_DOMAINS` | `79.143.180.186:8080` ✅ |
| `FRONTEND_URL` | `http://79.143.180.186:8080` ✅ |
| `SESSION_DRIVER` | `database` ✅ |
| `CACHE_STORE` | `database` ✅ |
| `QUEUE_CONNECTION` | `database` ✅ |
| `MAIL_MAILER` | `log` (par défaut) |

### Frontend (`/var/www/driveflow/frontend/.env.production`)

| Variable | Valeur |
|---|---|
| `VITE_API_BASE` | `http://79.143.180.186:8080/api` ✅ |
| `VITE_DEMO_MODE` | `false` ✅ |
| `VITE_ALLOW_MOCK_FALLBACK` | `false` ✅ |

Build artefacts produits :
```
dist/index.html                     1.53 kB │ gzip:   0.77 kB
dist/assets/index-C7es6Xar.css     37.09 kB │ gzip:  11.19 kB
dist/assets/index-D6EHgoWY.js   1,553.54 kB │ gzip: 416.61 kB
```

---

## 6. Commandes principales exécutées

```bash
# Préparation (depuis /var/www/driveflow)
git pull origin main
composer install --no-dev --optimize-autoloader
php artisan key:generate
php artisan migrate --force        # 60 migrations OK
php artisan db:seed --force        # RbacSeeder OK
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache
chown -R www-data:www-data backend/storage backend/bootstrap/cache

# Frontend
cd frontend
npm ci
npm run build                      # vite build production OK

# Nginx isolated
ln -s /etc/nginx/sites-available/driveflow /etc/nginx/sites-enabled/driveflow
nginx -t && systemctl reload nginx

# Queue worker
supervisorctl reread && supervisorctl update
supervisorctl start driveflow-worker

# Firewall
ufw allow 8080/tcp
```

---

## 7. Nginx Isolation

| Item | Valeur |
|---|---|
| Fichier de config | `/etc/nginx/sites-available/driveflow` (nouveau) |
| Symlink | `/etc/nginx/sites-enabled/driveflow` |
| Port d'écoute | `8080` (uniquement) |
| Root frontend | `/var/www/driveflow/frontend/dist` |
| Backend | `php-fpm` via `unix:/run/php/php8.2-fpm.sock` |
| `try_files` SPA fallback `/index.html` | ✅ OUI |
| `/api` proxifié vers Laravel | ✅ OUI |
| Blocage `.env`, `vendor/`, `storage/` privé | ✅ OUI |
| Gzip activé | ✅ OUI |
| Cache static assets | ✅ OUI |
| Site `paulbert` (existant) modifié | ❌ NON |
| `nginx -t` | ✅ PASS — `syntax is ok` / `test is successful` |
| `systemctl reload nginx` | ✅ PASS |

---

## 8. Queue & Scheduler

| Item | Valeur |
|---|---|
| Supervisor config | `/etc/supervisor/conf.d/driveflow-worker.conf` |
| Worker | ✅ `driveflow-worker RUNNING pid 122666, uptime 0:04:30` |
| Commande worker | `php8.2 artisan queue:work --queue=default --sleep=3 --tries=3` |
| Cron scheduler (`www-data`) | ✅ `* * * * * php artisan schedule:run` |

---

## 9. Sécurité

| Vérification | Résultat |
|---|---|
| `APP_DEBUG=false` | ✅ |
| `.env` non exposé (bloqué nginx) | ✅ (regex `~ /\.env`) |
| `vendor/` non exposé | ✅ |
| Permissions Laravel (`storage`, `bootstrap/cache` = `www-data:www-data`) | ✅ |
| Mot de passe DB stocké uniquement dans `.env` (chmod 640, owner `www-data`) | ✅ |
| UFW rules | `22/tcp`, `80/tcp` (existant), `443/tcp`, `8080/tcp` (DriveFlow) |
| HTTPS / TLS sur :8080 | ❌ pas activé en mode staging — à ajouter via Let's Encrypt si domaine attaché |

---

## 10. Compte administrateur

Le seeder utilisateur a été volontairement skippé (`Skipping user seeder: use driveflow_db users or insert via SQL`). Un compte admin a été créé manuellement :

| Champ | Valeur |
|---|---|
| User ID | `478b8fc9-2a4e-49fe-b783-ec6a60de8451` |
| Email | `admin@driveflow.local` |
| Status | `active` |
| Company | `59ef1139-fee8-46c1-b5df-a82f3fee063a` (DriveFlow local) |
| Rôle | `ADMIN` (id=1, via `user_roles`) |
| Permissions chargées au login | **211** |

> ⚠️ **Le mot de passe initial choisi pendant la mise en service est connu uniquement du propriétaire du serveur. Il doit être changé via l'écran Profil dès la première connexion.**

---

## 11. Tests de validation

### Frontend (HTTP)
```
$ curl -I http://127.0.0.1:8080/
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
Content-Type: text/html
```

### API health
```
$ curl -i http://127.0.0.1:8080/api/v1/health
HTTP/1.1 200 OK
{"success":true,"data":{"status":"ok",...,"checks":{"database":"ok","queue":"ok","storage":"ok","app_key":"ok"}}}
```

### API login (E2E)
```
$ curl -s -X POST http://127.0.0.1:8080/api/v1/auth/login -H "Content-Type: application/json" -d '{...}'
{"data":{"token":"1|...","token_type":"Bearer","user":{...,"role":"ADMIN",...},"permissions":[211 items]}}
```

### Projet existant intact
```
$ curl -I http://127.0.0.1/
HTTP/1.1 200 OK
ETag: "69f62573-353"   (paulbert, inchangé depuis le 02/05/2026)
```

| Test | Résultat |
|---|---|
| Existing project still works | ✅ PASS |
| DriveFlow frontend loads | ✅ PASS (HTTP 200, HTML React shell servi) |
| DriveFlow API health OK | ✅ PASS (`status: ok`, tous checks `ok`) |
| API login `POST /api/v1/auth/login` | ✅ PASS (token + 211 permissions) |
| Dashboard / Fleet / Invoices (UI) | ✅ Disponible — à finaliser côté navigateur par l'utilisateur |

---

## 12. Incidents rencontrés et résolutions

1. **PPA `ondrej/php` (sury) injoignable** depuis le VPS (`Could not connect to ppa.launchpadcontent.net:443`).
   - Impact : impossible d'installer/upgrader PHP 8.4. PHP 8.2 était déjà présent.
   - **Fix** : suppression de la source `ondrej-ubuntu-php-noble.sources`, court-circuit de l'étape `install_base` du script (variable `SKIP_INSTALL`/edit local), poursuite avec PHP 8.2.30 (compatible Laravel 12).

2. **Script `deploy/contabo-isolated-8080.sh` absent du repo cloné** initialement.
   - **Fix** : création locale du script sur le VPS via `nano` puis exécution.

3. **Apache2 redémarrage en échec** durant l'installation des packages PHP.
   - Cause : Apache (déjà installé pour `paulbert`) n'a pas pu rebinder `:80` car nginx l'occupait.
   - **Impact** : aucun. Apache n'est pas requis. nginx reste en charge de `paulbert` et de DriveFlow.

4. **Tinker `psysh` warning** (`Writing to directory /var/www/.config/psysh is not allowed`).
   - **Fix** : préfixer toutes les commandes tinker par `env HOME=/tmp`.

5. **`UserSeeder` non exécuté** par design.
   - **Fix** : création manuelle d'un utilisateur ADMIN aligné sur le vrai schéma (`first_name`, `last_name`, `password_hash`, `status`) + insertion dans `user_roles`.

6. **Storage symlink déjà existant** au 2ᵉ run (idempotence).
   - **Fix** : non bloquant, message informatif uniquement.

---

## 13. Statut final

| Indicateur | Valeur |
|---|---|
| **Statut déploiement** | ✅ **SUCCESS** |
| **Recommandation Go-Live** | ✅ **READY** (staging) |
| **Non-régression projet existant** | ✅ Confirmée |
| **Login admin** | ✅ Fonctionnel |

### Actions recommandées avant production réelle
- [ ] Changer le mot de passe admin via l'écran Profil dès la 1ʳᵉ connexion.
- [ ] Attacher un nom de domaine + activer TLS (Let's Encrypt) si exposition publique.
- [ ] Créer les utilisateurs métiers via l'UI Settings → Users (DIRECTEUR, AGENT_COMMERCIAL, etc.).
- [ ] Configurer le mailer SMTP (`MAIL_MAILER`, `MAIL_HOST`, etc.) si envoi de mails requis.
- [ ] Mettre en place les sauvegardes MySQL automatiques (`mysqldump` cron).
- [ ] Configurer un monitoring (uptime + erreurs Laravel `storage/logs/laravel.log`).

### URLs finales
- Frontend : http://79.143.180.186:8080
- API health : http://79.143.180.186:8080/api/v1/health
- Login : http://79.143.180.186:8080/login
