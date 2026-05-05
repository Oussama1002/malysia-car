# Phase 1 — Foundation (implemented)

## Backend (`/api` — Laravel 13)

- **App:** Sanctum installed; API routes registered with prefix `api` and version segment **`/api/v1/...`**
- **Health:** `GET /api/v1/health` (JSON, DB check)
- **Auth:** `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` (token), `GET /api/v1/auth/me` (protected)
- **Migrations**
  - Users: **UUID** primary key + `role` + `avatar`
  - Sanctum `personal_access_tokens` with **`uuidMorphs`**
  - **ERP base:** `branches`, `clients`, `vehicles`, `reservations` (from normalized legacy + growth), `audit_logs`, `documents` (morph, storage metadata)
- **Seeding:** `admin@driveflow.com` + `agent@driveflow.com` (password: `password`)
- **Cross-cutting**
  - `config/erp.php` + middleware `role:` + `permission:` (stub mapping, extend per module)
  - `App\Http\Responses\ApiResponse` (success + paginated)
  - `App\Http\Requests\ApiFormRequest` (JSON 422)
  - `App\Services\AuditLogger` (DB insert into `audit_logs`)
  - Global **JSON** responses for `api/*` in `bootstrap/app.php`
  - CORS: `config/cors.php` (publish)
  - Queue: `queue` = `database`, `QueueHealthCheckJob`, `ExampleMailNotification` (mailer `log` by default)
  - **Documents disk** `config/filesystems.php` → `documents` root `storage/app/documents`

### Run the API (local)

**MySQL (your `driveflow_db` + `driveflow_db.sql`):** see [api/docs/DATABASE-LOCAL.md](../api/docs/DATABASE-LOCAL.md) — import the SQL, set `api/.env` to `DB_DATABASE=driveflow_db`, then `php artisan migrate` (not `fresh`).

**SQLite (quick dev):** `DB_CONNECTION=sqlite` in `api/.env`, then:

```bash
cd api
copy .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

## Frontend (repo root, Vite + React)

- **`VITE_API_BASE`**: e.g. `http://127.0.0.1:8000/api` (see root `.env.example`)
  - If **empty**, login still uses the **`erpApi`** mock (`localStorage`).
  - If **set**, login calls Laravel **`POST /v1/auth/login`** and stores the Sanctum token in `df_session`.
- **HTTP client:** `services/apiClient.ts` (Bearer, 401 handling for authenticated calls)
- **Forms:** `react-hook-form` + `zod` (login: `loginFormSchema.ts`)
- **Resilience:** `components/ErrorBoundary.tsx`, `providers/QueryLoadingBar.tsx`
- **Breadcrumbs:** `modules/layout/AppBreadcrumbs.tsx` (in `AppLayout` main)
- **RBAC (UI):** `ActionPermissionGate` + `useErpPermission` + `domain/erpPermissions.ts` (align with `api/config/erp.php`)

### Run the SPA

```bash
npm install
npm run dev
# optional: set VITE_API_BASE in .env
```

**Done when (checklist):** API migrates, `/api/v1/health` returns 200, login returns token, SPA loads with auth shell, modules remain pluggable behind existing `ModuleGate` + new permission gate for actions.
