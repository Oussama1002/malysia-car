# DriveFlow — Rental availability conflict locking

**Date:** 2026-05-03  
**Goal:** Prevent double-booking and unsafe rental operations under concurrency, with clear API errors and operator UX.

## Summary

`RentalAvailabilityService` centralises calendar rules: fleet status, `availability_status`, overlapping reservations (lifecycle states that still hold the vehicle), **active** contracts only, overlapping missions (planned / in progress with real schedule bounds), and open repair / accident holds. Writes that must be race-safe use **`assertVehicleAvailableWithLock`**: a `SELECT … FOR UPDATE` on the **vehicle** row inside the same database transaction as the business mutation.

Route model binding for tenant-scoped models no longer loses rows because of the global `tenant_scope` alone: **`Reservation`** and **`Contract`** override **`resolveRouteBindingQuery`** to drop only the `tenant_scope` for URL resolution; **`EnsureTenantScope`** middleware still enforces company / branch / portal rules after the model is loaded.

## Backend

### Service (`App\Services\RentalAvailabilityService`)

| Method | Role |
|--------|------|
| `checkVehicleAvailability($vehicleId, $startAt, $endAt, $excludeReservationId, $excludeContractId)` | Read-only; returns `available`, `reasons`, `primary_code`, `messages`. |
| `assertVehicleAvailable(...)` | Same checks; throws `ValidationException` with `errors.vehicle_id` (human) and `errors.rental` (machine codes). |
| `assertVehicleAvailableWithLock(...)` | Starts from a locked vehicle row, then re-runs checks (use inside `DB::transaction`). |
| `contractActiveWindow(Contract $contract)` | Derives `[start, end]` Carbon bounds for activation checks. |

### HTTP integration

| Location | Behaviour |
|----------|-----------|
| `POST /api/v1/reservations` (`store`) | Transaction + vehicle lock + availability before insert. |
| `POST /api/v1/reservations/{id}/confirm` | Transaction: lock reservation row (`withoutGlobalScopes` + `lockForUpdate`), vehicle lock + check, then transition. |
| `POST /api/v1/reservations/{id}/request-extension` | Same pattern for extended window. |
| `POST /api/v1/contracts/{id}/activate` | Transaction: lock contract row, vehicle lock + check with `exclude_contract_id`, then activate. |
| `PUT/PATCH /api/v1/contracts/{id}` | When resulting `status` is `active` and `vehicle_id` is set, same availability + lock before save. |
| `GET /api/v1/rentals/availability` | Query params: `vehicle_id`, `start_at`, `end_at`, optional `ignore_reservation_id`, `ignore_contract_id`. |

### Indexes (`2026_05_03_240000_add_rental_availability_indexes`)

- `reservations`: `(vehicle_id, status, desired_start_at, desired_end_at)`
- `contracts`: `(vehicle_id, status, start_date, end_date)`
- `missions`: `(vehicle_id, status, scheduled_start_at, scheduled_end_at)`

### Tests (`tests/Feature/RentalAvailabilityLockingTest.php`)

- Non-overlapping reservations allowed.  
- Maintenance fleet status rejected.  
- Availability GET reflects conflict.  
- Confirm after another overlapping reservation is inserted → 422.  
- Contract activation blocked by overlapping confirmed reservation.  
- Contract activation succeeds when window is clear.  

Tests use `withoutMiddleware([EnsurePermission, EnsureRole])` so **`auth:sanctum`**, **`SubstituteBindings`**, and **`EnsureTenantScope`** stay realistic.

## Frontend (`frontend/modules/rentals/ReservationsOpsPage.tsx`)

- **New reservation:** React Query polls `GET /v1/rentals/availability` when vehicle + start + end are set; shows green / amber panels; disables **Créer** if unavailable; surfaces 422 payload via `ApiError`.
- **Detail / confirm:** Polls availability with **`ignore_reservation_id`** = current reservation so the operator sees whether confirmation is safe; **Confirmer** disabled when blocked.
- Shared French copy via `RENTAL_REASON_LABELS` + `formatRentalConflict`.
- `opsApi.rentalAvailability` accepts optional `ignoreContractId` for future tooling.

## Mobile ops (`frontend/modules/mobileOps`)

No UI change: mission boards remain list/kanban oriented; **server-side** rental rules still apply to any API that mutates reservations or contracts. Optional follow-up: prefetch availability when opening a mission tied to a reservation.

## Operational notes

- **True parallel HTTP** double-confirm is mitigated by **serialising on the vehicle row** inside transactions; extreme cross-request races should still funnel through MySQL/InnoDB row locks.  
- **Contract overlap** intentionally considers only **`status = active`** finance contracts (not draft / pending), to match product wording; tighten if draft contracts should reserve metal.  
- **`in_use` on `availability_status`** is treated as rentable (vehicle may already be on hire but not blocked for new planning—adjust if your process differs).

---

*End of report.*
