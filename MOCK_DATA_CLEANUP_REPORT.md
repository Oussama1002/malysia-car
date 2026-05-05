# Mock Data Cleanup — Phase 2 Report

**Date:** 2026-04-28
**Scope:** Replace localStorage / `erpApi` mock backings with real Laravel APIs on `NotificationsPage`, `AuditPage`, `SettingsPage`, `RentalsPage`. Introduce a `VITE_DEMO_MODE` flag so non-backend builds either show the demo store **or** an explicit "configure backend" message — never silent mock data.

---

## 1. Summary

| Page                | Before                                          | After                                                                  |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `NotificationsPage` | localStorage via `erpStore`                     | `GET /v1/notifications` + mark-read / mark-all-read / delete           |
| `AuditPage`         | localStorage via `erpStore`                     | `GET /v1/audit-logs` (permission-gated) with module/action/date filters |
| `SettingsPage`      | `erpApi.getBranches()` (mock)                   | `adminApi.listBranches()` against `/v1/branches`                        |
| `RentalsPage`       | Always rendered the mock screen                 | Backend → real ops page; demo flag → mock; otherwise → setup notice    |

A new `isDemoMode()` helper reads `VITE_DEMO_MODE`. The legacy `ReservationsList` mock screen now only renders when the flag is explicitly enabled.

---

## 2. Backend changes

### Notifications
- **Migration:** `database/migrations/2026_04_28_100000_create_app_notifications_table.php`
  Creates `app_notifications` (the `notifications` table is reserved by an older messaging-queue feature, so this one is namespaced).
  Columns: `id (uuid)`, `user_id`, `company_id`, `category`, `title`, `body`, `link_url`, `payload (json)`, `read_at`, timestamps, indexes on `user_id`, `read_at`, `(user_id, read_at)`.
- **Model:** `app/Models/Notification.php` — `HasUuids`, `$table = 'app_notifications'`, casts payload+read_at.
- **Controller:** `app/Http/Controllers/Api/V1/NotificationController.php` — `index`, `unreadCount`, `markRead`, `markAllRead`, `destroy`. All scoped to the authenticated user.
- **Routes** (auth + sanctum):
  - `GET    /v1/notifications`
  - `GET    /v1/notifications/unread-count`
  - `POST   /v1/notifications/mark-all-read`
  - `POST   /v1/notifications/{id}/read`
  - `DELETE /v1/notifications/{id}`
  No extra permission middleware — every authenticated user owns their own feed.

### Audit logs
- **Existing schema reused:** `audit_logs` already exists (`module_name`, `action_type`, `created_at`, `before_data`, `after_data`, `legal_significance`). The model was rewritten to match (`$timestamps = false`, explicit `$fillable`/`$casts`).
- **Resource:** `app/Http/Resources/AuditLogResource.php` — flattens to the shape the frontend expects (`module`, `action`, `actor_email`, `actor_role`, `entity_type`, `entity_id`, `changes`, `ip_address`, `occurred_at`, ...).
- **Controller:** `AuditLogController@index` — paginated, filters on `module`, `action`, `user_id`, `entity_type`, `from`, `to`. Eager-loads `user:id,email,role`.
- **Route:** `GET /v1/audit-logs` → `permission:audit.view`.
- **RBAC:** added `audit.view` permission (module `admin`) to `RbacSeeder` + `config/erp.php` fallback (`ADMIN`, `DIRECTEUR`).

---

## 3. Frontend changes

- `services/endpoints.ts` — `notifications` is now an object (`list`, `unreadCount`, `markRead(id)`, `markAllRead`, `destroy(id)`); `audit` → `/v1/audit-logs`.
- `services/notificationsApi.ts` (new) — typed `NotificationDto` + CRUD wrappers.
- `services/auditApi.ts` (new) — typed `AuditLogDto` + `auditApi.list(filters)`.
- `services/apiClient.ts` — added `isDemoMode()` reading `VITE_DEMO_MODE`.
- `modules/notifications/NotificationsPage.tsx` — React Query, header counter, "Tout marquer lu" + per-row delete, empty/loading states, "backend non configuré" fallback.
- `modules/audit/AuditPage.tsx` — module/action/from/to filters, paginated table, "backend non configuré" fallback.
- `modules/settings/SettingsPage.tsx` — switched to `adminApi.listBranches()`; renders branch table from real data.
- `modules/rentals/RentalsPage.tsx` — three-way branch: backend / demo flag / setup notice.
- `.env.example` — documented `VITE_DEMO_MODE=false`.

---

## 4. Acceptance verification (preview, port 3000)

| Page             | Path             | Result                                                                    |
| ---------------- | ---------------- | ------------------------------------------------------------------------- |
| Audit            | `/audit`         | "Journal des changements sensibles (0 entrée(s))." + module filter rendered |
| Notifications    | `/notifications` | "Centre in-app — 0 non lue(s) sur 0" empty state                            |
| Settings         | `/settings`      | Tabs render, Agences tab queries `/v1/branches`                            |

No new console errors introduced (the `/dashboard` duplicate-key warning is pre-existing and unrelated to this work).

---

## 5. Deploy steps

1. `php artisan migrate` (applies `app_notifications`).
2. `php artisan db:seed --class=RbacSeeder` to register the new `audit.view` permission and attach it to ADMIN/DIRECTEUR.
3. Frontend: set `VITE_API_BASE` (and optionally `VITE_DEMO_MODE=false`) in `.env`, then `npm run build`.

---

## 6. Known follow-ups (not in this phase)

- `screens/VehiclesList`, the `erpStore` localStorage layer for clients/credit/contracts/usedcars, and several detail screens still use the mock facade. They will be migrated in the corresponding domain phases.
- Notification *creation* is intentionally not exposed via API; emit-side wiring (events / observers writing to `app_notifications`) belongs in the domain phases that produce notifications.
- The pre-existing `/dashboard` duplicate-key React warning is unrelated and remains tracked separately.
