# Routing Fix Report

Date: 2026-04-30

## Scope

- Backend API v1 routing normalization
- Frontend role/module access normalization
- Frontend route fallback behavior hardening

## Backend Changes

- Fixed signature webhook route in `backend/routes/api.php`:
  - from `POST /api/v1/v1/signatures/webhooks/provider`
  - to `POST /api/v1/signatures/webhooks/provider`
- Verified `/api/v1` route group remains single-prefixed.
- Verified auth and authorization middleware strategy is intact:
  - global authenticated group uses `auth:sanctum`
  - sensitive routes retain `permission:*`
  - role-sensitive routes retain `role:*` constraints

## Frontend Changes

- Updated `frontend/domain/appRole.ts`:
  - Added missing `ModuleKey` values:
    - `accounting`
    - `signatures`
  - Updated `ROLE_MODULE_ACCESS`:
    - `COMPTABLE` includes `accounting` + `finance`
    - `ADMIN` and `DIRECTEUR` keep full access
    - `CONTENTIEUX` keeps `arrears` access (covers `/arrears/legal`)
    - `AGENT_COMMERCIAL` aligned to `customers/contracts/usedCars/rentals` (+ shared `dashboard/notifications`)
- Updated sidebar module mapping in `frontend/modules/layout/AppLayout.tsx`:
  - added `/accounting` navigation item
  - added `/signatures` navigation item
- Updated locale labels for new nav entries:
  - `frontend/locales/fr.json`
  - `frontend/locales/en.json`
  - `frontend/locales/ar.json`
- Updated fallback routing in `frontend/routes/AppRoutes.tsx`:
  - unknown routes now render a local Not Found page
  - redirect to `/dashboard` is now used by access-gates (forbidden access), not by wildcard fallback

## Validation Executed

- `php artisan route:list` (backend): OK
  - `api/v1/signatures/webhooks/provider` present
  - no `/v1/v1` route found
- `npm run build` (frontend): OK

## Acceptance Criteria Status

- `/api/v1/signatures/webhooks/provider` exists once: PASS
- `/accounting` accessible to `COMPTABLE` in role-module gate: PASS
- `/signatures` accessible to authorized roles: PASS
- valid module access no longer incorrectly falls through wildcard redirect: PASS
- `npm run build` passes: PASS
- `php artisan route:list` shows no `/v1/v1`: PASS
