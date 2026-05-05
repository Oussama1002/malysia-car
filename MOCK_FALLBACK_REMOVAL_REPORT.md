# Mock / Fallback Removal Report

## Goal

Phase 5 is completed to enforce a production posture with no hidden fake data path.

Implemented outcome:

- Production mode now uses backend APIs only.
- Silent API-to-mock fallback paths were removed from active frontend modules/services.
- API failure now surfaces as explicit errors rather than synthetic local data.

## Environment Flags

Added/updated frontend flags:

- `VITE_DEMO_MODE=false`
- `VITE_ALLOW_MOCK_FALLBACK=false`

Updated files:

- `frontend/.env.example`
- `frontend/.env.local`
- `frontend/config/runtimeFlags.ts` (new `isMockFallbackAllowed()` guard)

## Production Fallback Removal

### Removed from active services/pages

- `frontend/services/contractsApi.ts`
  - removed `erpApi` fallback in `list()` and `get()`
  - now throws explicit backend-required errors
- `frontend/services/creditApi.ts`
  - removed `erpApi` fallback in `list()`
- `frontend/services/opsApi.ts`
  - removed `erpApi` fallback in `missions()` / `reservations()`
  - removed synthetic photo upload object when backend is missing
- `frontend/services/gpsApi.ts`
  - removed `erpApi` fallback in alerts/geofences/fleet vehicles
- `frontend/services/customersApi.ts`
  - removed synthetic KYC document response (`mock-*`) when backend is missing
- `frontend/modules/contracts/ContractWizardPage.tsx`
  - removed local mock customer/vehicle fallback paths
- `frontend/modules/auth/AuthContext.tsx`
  - removed mock login path and made missing API an explicit unreachable state
- `frontend/modules/shared/components/AICopilot.tsx`
  - removed simulated assistant answer path
  - wired to real backend AI assistant API with visible error handling

### Demo-only layer hard guard

- `frontend/services/erpStore.ts` now throws when mock fallback is not allowed.
- `frontend/services/mockApi.ts` now throws when mock fallback is not allowed.
- `frontend/services/erpApi.ts` login mock path is blocked when mock fallback is disabled.

This keeps demo-only code isolated behind:

- `VITE_DEMO_MODE=true`
- `VITE_ALLOW_MOCK_FALLBACK=true`

## Codebase Cleanup

Removed:

- `frontend/modules/shared/components/ModuleInPreparationNotice.tsx`
- Remaining imports/usages of `ModuleInPreparationNotice`

Verified no active production references for:

- `AiPredictionPlaceholder`
- `ModuleInPreparationNotice`
- `erpApi` / `mockApi` in `frontend/modules/*`
- Silent `if (!hasBackend()) return ...` patterns in active services

## Added Regression Test (Frontend Guard)

Added static guard script:

- `frontend/scripts/assert-no-production-mock.mjs`
- npm script: `npm run test:no-mock`

What it enforces in production paths (`modules`, `routes`, `services`, `config`):

- no `erpApi` imports/usages (except explicitly allowlisted demo-only files)
- no `mockApi` imports/usages (except allowlisted demo-only files)
- no known silent mock fallback markers

Execution result:

- `npm run test:no-mock` ✅ passed

## Backend/Frontend Validation

Executed:

- `php artisan test` ✅ (111 passed)
- `npm run build` ✅

## Acceptance Checklist

- [x] ZERO mock in production mode (`VITE_DEMO_MODE=false`)
- [x] ZERO silent fallback on API failure
- [x] Active modules consume backend data paths
- [x] Errors are visible/explicit when backend is unavailable
- [x] Demo-only mock path remains gated behind explicit demo flags
- [x] Tests pass
- [x] Build passes
