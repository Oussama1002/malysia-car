# FRONTEND DELIVERY SURFACE CLEANUP REPORT

## 1) Objective

Prepare the DriveFlow frontend for client delivery by removing production exposure to placeholder/legacy/demo screens and mock fallbacks.

## 2) Keyword Audit (frontend)

Searched for:

- `erpApi`
- `erpStore`
- `mockApi`
- `localStorage`
- `placeholder`
- `coming soon`
- `demo`
- `mock`
- `stub`

Main findings:

- Legacy/mock data paths were still present in `frontend/services/apiClient.ts` and `frontend/modules/fleet/FleetVehicleDetailPage.tsx`.
- `/fleet` still depended on legacy `screens/VehiclesList.tsx` (which references `mockApi` and fallback logic).
- AI routes and AI navigation entry points were always available in routes/sidebar.
- Settings had unfinished tabs visible in the main settings page.

## 3) Changes Implemented

### Environment flags

- Updated `frontend/.env.example`:
  - `VITE_DEMO_MODE=false`
  - `VITE_SHOW_EXPERIMENTAL=false`
- Updated `frontend/.env.local`:
  - `VITE_DEMO_MODE=false`
  - `VITE_SHOW_EXPERIMENTAL=false`

### Runtime gating for production

- Added `frontend/config/runtimeFlags.ts` with:
  - `isDemoModeEnabled()`
  - `isExperimentalEnabled()`

### AI placeholder and experimental surface hidden in production

- `frontend/routes/AppRoutes.tsx`
  - Removed `/dashboard/classic` route exposure.
  - Wrapped AI routes (`/ai`, `/ai/assistant`, `/ai/predictions/:topic`) behind `isExperimentalEnabled()`.
- `frontend/modules/layout/AppLayout.tsx`
  - Sidebar now hides `ai` module when `VITE_SHOW_EXPERIMENTAL=false`.
  - AI Copilot FAB/drawer hidden unless experimental flag is enabled.
- `frontend/modules/shared/components/CommandPalette.tsx`
  - AI quick navigation command is filtered out when experimental is disabled.

### Incomplete settings tabs hidden from standard navigation

- `frontend/modules/settings/SettingsPage.tsx`
  - Settings tabs now expose only the production-ready `Agences` tab.
  - For legacy/incomplete tab content, replaced placeholder text with admin-only notice component.

### Admin-only "module en preparation"

- Added `frontend/modules/shared/components/ModuleInPreparationNotice.tsx`.
  - Visible only for `ADMIN`.
  - Hidden for client and non-admin roles.
- Applied in:
  - `frontend/modules/settings/SettingsPage.tsx` (unfinished sections)
  - `frontend/modules/fleet/FleetVehicleDetailPage.tsx` (unfinished docs section)
  - `frontend/modules/signature/SignatureEnvelopeDetailPage.tsx` (internal unfinished mode notice)

### Mock fallback removal and real API posture

- `frontend/services/apiClient.ts`
  - Removed user-facing guidance that referenced mock layer fallback.
  - API base misconfiguration now returns a strict API error state only.
- `frontend/modules/fleet/FleetVehicleDetailPage.tsx`
  - Removed `erpApi` fallback path.
  - Vehicle detail query is now API-only when backend is configured.

### `/fleet` migrated away from legacy screen

- `frontend/modules/fleet/FleetListPage.tsx`
  - Replaced legacy `screens/VehiclesList` usage with direct API list query (`/v1/vehicles`).
  - Added proper states:
    - API not configured state
    - loading state
    - API error state
    - empty state
    - list state with links to `/fleet/:id`

### `/rentals` verification

- `frontend/modules/rentals/RentalsPage.tsx` was already API-only and kept as-is:
  - No mock fallback.
  - Shows backend configuration message when API base is missing.

## 4) Acceptance Criteria Check

- Production navigation shows only usable modules: **PASS**
  - AI routes/sidebar hidden unless `VITE_SHOW_EXPERIMENTAL=true`.
  - Classic dashboard route removed.
  - Settings unfinished tabs removed from user-facing tab navigation.
- No mock data in production mode: **PASS (targeted surfaces fixed)**
  - Fleet list/detail now API-first and no local/mock fallback path in these delivery surfaces.
- No legacy route visible to client users: **PASS**
  - Classic dashboard route no longer exposed.
  - AI placeholders not exposed by default.
- AI placeholders hidden unless experimental flag enabled: **PASS**
- `npm run build` passes: **PASS**

## 5) Build / Validation Commands

- `npm run build` (from `frontend`) -> **success**

Build summary:

- Vite build completed successfully.
- Output generated in `frontend/dist`.
- Non-blocking chunk size warning remains (performance optimization item, not a release blocker for this cleanup).

## 6) Residual Notes

- Legacy `frontend/screens/*` files still exist in repository history/workspace but are no longer used by `/fleet` route surface.
- If desired, next hardening step can fully deprecate/remove unused legacy screen files after a final smoke test.
