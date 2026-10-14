# DriveFlow — Onboarding for Coding Agents

**Read this before touching any file.** By the end of this doc you should be able to clone the repo, run every surface locally, know which commands to paste on the Contabo server, and understand the business rules the client has already pushed back on.

If something in this file contradicts a user instruction in the current conversation, the user wins — this is a baseline, not a court order.

---

## 1. What DriveFlow is

A car-rental ERP for a Moroccan agency (Malysia Car Pro), delivered as three surfaces talking to one Laravel backend:

| Surface | Stack | Where it lives | Who reads it |
|---|---|---|---|
| **Backend ERP API** | Laravel 11 + MariaDB 10.11 + php8.3-fpm | `backend/` | Everyone else |
| **Web ERP** | React 18 + Vite + Tailwind + React Query | `frontend/` | Agents on a desktop |
| **Mobile app** | Flutter (web + native) + Riverpod + Dio | `mobile/` | Agents on a phone — served as web PWA at `/mobile-web/` |
| **Public landing page** | React (same `frontend/`, routes under `/public/*`) | `frontend/modules/site/` | End customers requesting a rental |

Public-site requests become **WebsiteLead** rows that agents convert to Reservations → Contracts → Payments → Invoices.

Production URL: **http://79.143.180.186:8080** (HTTP, no domain / SSL yet).

---

## 2. Repo layout

```
backend/        Laravel 11 (API only, no Blade views except PDF templates)
  app/
    Http/Controllers/Api/V1/   REST controllers, versioned
    Http/Resources/            API shape (JSON output transformers)
    Http/Requests/             FormRequest validators
    Models/                    Eloquent models (UUIDs, soft deletes where it makes sense)
    Services/                  Business logic that outlives a request
      RentalAvailabilityService.php   Vehicle overlap check — read this before touching contracts/reservations/swaps
      AuditLogger.php                  All writes go through this
      AuditTrailPresenter.php          Renders audit_logs rows in French for the UI
      PdfService.php                   DomPDF wrapper that persists a GeneratedDocument row
      ContractFormFields.php           Maps a Contract to the mm-coordinates printed on the paper form
      PaymentMethodNormalizer.php      virement/cheque/espèces → bank_transfer/check/cash
  database/migrations/         Chronologically named, idempotent on re-apply
  database/seeders/            RbacSeeder.php is the one you'll touch most
  config/                      contract_form.php holds the PDF print coordinates
  resources/views/pdf/         Blade templates for PDFs (contract_facsimile, contract_overlay, invoice)
  routes/api.php               Everything is prefixed /v1/

frontend/
  modules/                     One folder per domain. Convention: a page component + sub-components + a hooks folder.
    rentals/                   Reservations
    contracts/                 Contract wizard, detail, settings
    customers/                 Clients
    fleet/                     Vehicles
    finance/                   Payments, invoices
    settings/                  ParametersPage is at /settings/parameters
    shared/components/         Pickers, drawers, DateField (always dd/MM/yyyy), EntityDocuments
  services/                    apiClient, companySettingsApi, opsApi, contractsApi, financeApi, documentsApi, dtos
  routes/AppRoutes.tsx         Single source of truth for URLs
  .env.local                   Dev config. VITE_API_BASE points at your local Laravel.

mobile/
  lib/features/*               Mirrors frontend/modules naming
  lib/core/api/api_client.dart Dio wrapper. Reads base URL from AppConfig.
  lib/core/auth/               currentUserProvider is the Riverpod source of truth for the logged-in agent
  pubspec.yaml                 pdfx + url_launcher + dio + riverpod + go_router + flutter_secure_storage
```

---

## 3. Local dev

### 3.1 Prereqs
- PHP 8.3 (XAMPP works)
- Composer
- Node 20+ and npm
- Flutter 3.5+ (`flutter --version`)
- MariaDB 10.11 or MySQL 8 (XAMPP ships MySQL — fine)

### 3.2 Backend

```bash
cd backend
composer install
cp .env.example .env   # if .env doesn't exist already
php artisan key:generate
# Point DB_* at your local MySQL. For XAMPP: DB_HOST=127.0.0.1 DB_PORT=3306 DB_DATABASE=driveflow DB_USERNAME=root DB_PASSWORD=
php artisan migrate --seed
php artisan serve --port=9000
```

The frontend reads `VITE_API_BASE=http://localhost:9000/api` (see `frontend/.env.local`). **Port 9000 is intentional** — don't change it unless you also update `.env.local`.

### 3.3 Web frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at **http://localhost:3000**. CORS + Sanctum are pre-configured for this port.

### 3.4 Mobile app (Flutter web)

```bash
cd mobile
flutter pub get
flutter run -d chrome --web-port 3100
```

Mobile's `AppConfig.apiBaseUrl` picks up the Laravel URL automatically on web.

### 3.5 Never use git worktrees

Memory `feedback-local-dev-worktree` is non-negotiable: **work on the main local project only**, push, give deploy commands. Worktrees get stale, break the user's tooling, and the user will tell you off.

---

## 4. Server — Contabo VPS

Every memory file in `~/.claude/projects/c--xampp2-htdocs-driveflow/memory/` carries deployment rules. The ones that get re-stated the most:

- `/var/www/driveflow` = repo clone. **artisan lives at `/var/www/driveflow/backend`.** Never run `php artisan` from `/var/www/driveflow`.
- You are **already SSH'd into the server** when the user pastes the deploy prompt. Never prepend `ssh root@…`.
- Services:
  - `php8.3-fpm` — reload after any backend code change: `systemctl reload php8.3-fpm`
  - `driveflow-worker` — Laravel queue worker, systemd. Restart only when a queue/job class changed (OCR, notifications): `systemctl restart driveflow-worker`
  - `nginx` — reload after any dist swap: `systemctl reload nginx`
- **The frontend `dist/` is gitignored**. Every frontend change needs `npm run build` on the server.

### 4.1 Standard deploy template

```bash
cd /var/www/driveflow && git pull

# Backend changes
cd /var/www/driveflow/backend
php artisan migrate --force              # if migrations touched
php artisan config:clear
php artisan cache:clear
systemctl reload php8.3-fpm
systemctl restart driveflow-worker       # only if queue/job code changed

# Web frontend changes
cd /var/www/driveflow/frontend
rm -rf dist node_modules/.vite
npm run build
systemctl reload nginx

# Mobile-web bundle changes
cd /var/www/driveflow/mobile
rm -rf build/web
flutter build web --release --base-href /mobile-web/
rsync -a --delete /var/www/driveflow/mobile/build/web/ /var/www/driveflow/public/mobile-web/
systemctl reload nginx
```

**`/mobile-web/` nginx root is `/var/www/driveflow/public/mobile-web/`.** Not `mobile/build/web/`, not `mobile-web/` — the `public/` directory. Verify with:

```bash
grep -rn "mobile-web" /etc/nginx/sites-enabled/
```

### 4.2 Flutter-web gotcha

Flutter-web has a sticky service worker. After every deploy the agent testing must open DevTools → **Application → Clear site data** on the `/mobile-web/` origin, otherwise `flutter_service_worker.js` keeps serving the old bundle.

---

## 5. Business rules the agents already pushed back on

Breaking these is why I'm rewriting a bunch of docs — don't repeat the mistakes.

### 5.1 Tarif / price (memory `feedback-no-vehicle-tarif`)

- The vehicle's fleet `daily_rental_price` **only** feeds the public landing-page quote. Never auto-fill a contract or reservation daily rate from the vehicle record.
- `reservations.source` tags the origin (`'website_lead'` or `'manual'`). Only `website_lead` reservations are allowed to carry a tarif forward into the contract — everywhere else, the agent types the price on the contract.
- Agents never see the vehicle's fleet price on any back-office picker (Nouvelle réservation, swap wizard, contract wizard).

### 5.2 Franchise d'assurance (not "Caution")

- The French label everywhere is **Franchise d'assurance**. Backend enum stays `caution` (API contract), but the UI label is Franchise d'assurance on both web and mobile.
- A franchise encaissée is a Payment with `payment_type: 'caution'`. It feeds `totals.deposit_paid` on the reservation, **not** `totals.paid` (so Payé location stays accurate).
- Franchise d'assurance has its own payment mode selector on the Conditions step of the contract wizard — don't piggyback it on the first rent payment's method.

### 5.3 Contract wizard flow

Correctness ordering (keep in this order, don't swap):

1. `ensureDraftContract()` — creates OR PATCHes the draft with the latest state.
2. Create every Payment row via `POST /v1/payments`. Each one triggers `maybePromoteContract` on the backend → status flips from `draft` to `approved`.
3. `POST /v1/contracts/{id}/activate` — best-effort. If it refuses (overlap, missing settings, race), the contract is already Approuvé with real payments. Do NOT block or revert.
4. `POST /v1/contracts/{id}/generate-pdf` → `GET /v1/generated-documents/{docId}/download` → browser download.
5. Delay the SPA navigation ~400ms after download so the browser commits the blob.

If activate() fails with `overlapping_reservation` on a contract built from a reservation, the exclude list is missing the `reservation_id` — check `ContractController@store` persists it and that `assertVehicleAvailableWithLock` is called with `$locked->reservation_id`.

### 5.4 Contract types

- Default visible types: **LLD** and **LCD** (`LOCATION_COURTE`) only.
- `settings.contracts.enabled_contract_types` is a CSV admin whitelist. `LOA`, `CREDIT_AUTO`, `VENTE_VO` stay in the catalog but hidden until an admin toggles them on at `/settings/parameters?tab=contracts`.

### 5.5 Vehicle picker

- Every picker row shows a status chip: Disponible / Loué / Réservé / Maintenance / Réparation / Indisponible / Vendu / Rebut / En attente.
- Unavailable rows are **unselectable** (web: `disabled` + `cursor-not-allowed`; mobile: `enabled: false` + 0.55 opacity).
- Status derivation order (same as backend's `RentalAvailabilityService`): `hasActiveContract` → `hasActiveReservation` → `availability_status` → raw `status`.
- Backend occasionally returns `in_use`, `repair`, `immobilized`, `accident`, `pending` — translate every one of them in both the web `ReservationsOpsPage.statusFr` map and mobile `VehicleDto.statusLabel`.

### 5.6 Dates

- All date UIs on both platforms render as **dd/MM/yyyy**. Native `<input type="date">` is forbidden on the web — use `DateField` from `frontend/modules/shared/components/DateField.tsx` (ISO contract, French display).
- Mobile uses `DateFormat('dd/MM/yyyy', 'fr')` via `_DateField`.

### 5.7 Required fields on the contract wizard

Loyer / Mensualité, Franchise d'assurance, Date de début and Date de fin are all required with asterisk + red "Requis pour continuer." helper + canNext gating. Add any new required field in the same style.

### 5.8 Client picker rows

Every client dropdown (web + mobile) renders as `Name · XXXXXXX (Particulier)` where XXXXXXX is the CIN (individual) or ICE (entreprise). No "CIN" prefix, no customer code (CL0001), no compliance status in the dropdown line. Compliance status moves to the selected-client card below the picker.

### 5.9 Agent assigné

The Agent assigné field on the contract wizard is **locked to the connected user** and read-only on both platforms. A contract is generated by the agent who signs it — don't let the field be free-form.

### 5.10 Removed buttons

- "Confirmer" on the reservation detail is removed on both web and mobile. A reservation is only confirmed as a side-effect of finishing the contract wizard with at least one payment (backend `maybePromoteContract` flips the linked reservation too).
- "Contrat" button on the reservation detail header hides when `has_contract` is true. The Contrat tab remains the single entry.

### 5.11 Duplicate contracts

`ContractController@store` returns **409** when a reservation already has a non-cancelled / non-terminated contract. Honour that — don't retry the same POST, surface the message to the agent.

---

## 6. API conventions

- Base path: `/api/v1/*`. Base URL in the browser: whatever `VITE_API_BASE` says.
- Auth: Laravel Sanctum **Bearer** tokens stored in `localStorage.df_session` (web) / `flutter_secure_storage` (mobile). Attach `Authorization: Bearer <token>` on every protected request.
- Response envelope:
  ```json
  { "data": { ... }, "meta": null, "links": null }
  ```
  Use `App\Http\Responses\ApiResponse::success($data, ?array $meta, ?array $links, int $status)`. **There is no message slot** — put a message in `$meta` as `['message' => 'Done.']`.
- Permissions: every route after `/auth/*` has a `permission:xxx.yyy` middleware. If a POST silently 403s, the role is missing the permission. Check `RbacSeeder` + grant it via an idempotent migration (see `backend/database/migrations/2026_10_13_140000_grant_payments_create_to_agent_commercial.php` for the template).
- Audit: every write goes through `AuditLogger::created / updated / deleted / statusChanged / financialAction / legalAction / record`. **Never `return $model->save()` without an audit call.**
- The reservation detail returns `totals` built by `ReservationController::buildTotals`. When a contract is linked, totals come from the contract (`base_amount`, `deposit_amount`, `allowed_km`). Keep this truth-source order — don't flip it.

---

## 7. Debugging checklist

When a mobile user says "I don't see the change":
1. `git pull` on the server.
2. `grep -c '<new French string>'` in `mobile/lib/features/.../file.dart` — must be `>0`.
3. `cd mobile && flutter build web --release --base-href /mobile-web/` — this rebuilds `build/web/main.dart.js`.
4. `rsync -a --delete mobile/build/web/ /var/www/driveflow/public/mobile-web/`.
5. `grep -c '<new string>' /var/www/driveflow/public/mobile-web/main.dart.js` — must match.
6. User clears site data in DevTools and reloads.

When a backend 500 happens:
```bash
tail -n 80 /var/www/driveflow/backend/storage/logs/laravel.log
```

Then look for the first stack trace. 95% of them are:
- `Array to string conversion` — a JSON-cast column fed to `array_diff_assoc`. Build the diff by hand.
- 404 on a route that "should exist" — the frontend expects `/v1/foo-bar` but the backend has `/v1/foo/{bar}`. Add the aggregate alias on the backend rather than renaming the frontend.
- Validation 422 with English keys — the backend enum rejected a value. Check `PaymentController::store` payment_type and `payment_method` enums first.

---

## 8. House rules

- **Commit, push, deploy.** Memory `feedback-push-and-deploy`: commit + push silently, then only hand the user the server deploy commands. Never ask "want me to push?".
- **Full server commands, every time.** Memory `feedback-deploy-commands`: never reference a previous message's commands — always paste the full block.
- **Attribution.** End commits with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`. End PR bodies with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. These are automatic — the harness reminds you — but don't strip them.
- **Memory first.** Before changing a pattern, check if there's a memory file about it. Most "surprising" rules (artisan path, no vehicle tarif, no SSH prefix, worker restart) are already written down.
- **Dates: dd/MM/yyyy on screen, ISO on the wire.** Always.
- **French in the UI, English in the DB.** Backend enums stay as `caution`, `paiement_location`, `reserved`, `active` — the UI maps them to Franchise d'assurance / Loyer / Réservé / Actif at render time.
- **No worktrees.** Repeated for emphasis.

---

## 9. Where to look when you don't know

| Question | File |
|---|---|
| "What URL does X hit?" | `frontend/services/endpoints.ts`, `mobile/lib/features/*/data/*_repo.dart`, `backend/routes/api.php` |
| "Why did availability fail?" | `backend/app/Services/RentalAvailabilityService.php::evaluate()` |
| "Why isn't the PDF value showing?" | `backend/config/contract_form.php` (mm coordinates) + `backend/resources/views/pdf/contract_facsimile.blade.php` + `frontend/modules/contracts/ContractPaperPreview.tsx` (same math) |
| "What label is this status?" | Web: `frontend/modules/rentals/ReservationsOpsPage.tsx` (`statusFr`), `frontend/modules/rentals/tabs/*.tsx`. Mobile: `mobile/lib/features/vehicles/data/vehicle_dto.dart` (`statusLabel`). |
| "What settings exist and who can read them?" | `backend/app/Http/Controllers/Api/V1/CompanySettingsController.php::allowedKeys()` + `frontend/services/companySettingsApi.ts` payload type |
| "What runs on the queue?" | `backend/app/Jobs/*` + `backend/app/Services/*Notifier.php` — restart `driveflow-worker` after touching any of these |

Good luck. Read the memory files once, bookmark `backend/app/Http/Controllers/Api/V1/` and `frontend/modules/`, and ask the user about any rule you're about to break — they've already pushed back on most of them.
