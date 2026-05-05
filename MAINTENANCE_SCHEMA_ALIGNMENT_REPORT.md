# DriveFlow — Maintenance schema alignment

**Date:** 2026-05-02  
**Goal:** One canonical `vehicle_maintenance_events` model: `performed_at` and `cost_mad` (plus existing migration columns: `type`, `odometer_km`, `vendor`, integer `id`).

## Canonical database columns

Source: `2026_04_23_120050_create_vehicle_maintenance_events_table.php`

| Column | Type / notes |
|--------|----------------|
| `id` | Big integer (auto) |
| `vehicle_id` | UUID, FK → `vehicles` |
| `type` | Nullable string (OIL_CHANGE, TIRES, …) — **not** `event_type` in DB |
| `title` | Required in API |
| `description` | Optional |
| `performed_at` | Date (nullable) — **not** `event_date` |
| `odometer_km` | Optional unsigned int — **not** `mileage_at_service` in DB |
| `vendor` | Optional string — **not** `vendor_name` in DB |
| `cost_mad` | Optional decimal — **not** `cost` / `cost_amount` |
| `created_by` | UUID (nullable), aligned with `users.id` |

### Indexes

- Existing composite: `(vehicle_id, performed_at)` from the original migration.
- Added in `2026_05_02_100000_align_vehicle_maintenance_events_schema.php`: standalone index on `performed_at` for fleet-wide date-range aggregates.

### Validation

- `StoreMaintenanceEventRequest`: `cost_mad` nullable, `numeric`, **`min:0`** when provided.

### Legacy API payloads

`prepareForValidation()` maps deprecated keys into canonical ones:

- `event_type` → `type`
- `completed_date` → `performed_at`
- `cost_amount` → `cost_mad`
- `mileage_at_service` → `odometer_km`
- `vendor_name` → `vendor`

## Application changes

| Layer | Change |
|-------|--------|
| `VehicleMaintenanceEvent` model | Removed incorrect UUID PK trait; fillable/casts match migration (`performed_at`, `cost_mad`, `type`, `odometer_km`, `vendor`). |
| `VehicleMaintenanceEventController` | Persists only canonical columns; removed obsolete notification logic tied to nonexistent `scheduled_date` / `status` on events. |
| `MaintenanceService` | Queries use `type`, `performed_at`, `odometer_km`; `advancePlans()` skips events without `type`. |
| `MaintenanceMonitoringController` | Monthly cost: `performed_at >= month start`, `sum(cost_mad)`. |
| `DashboardController` | Executive + fleet maintenance totals use `whereDate(performed_at, …)` for correct SQLite/MySQL boundary behaviour (not raw `whereBetween` on mixed date/datetime storage). |
| `VehicleCostService` | Maintenance total: `sum('cost_mad')`. |
| `Vehicle` / `VehicleController` | Order maintenance events by `performed_at`. |
| `VehicleAccidentController` (timeline) | Maintenance entries use `performed_at`, `cost_mad`, `vendor`. |

## Tests

`tests/Feature/MaintenanceSchemaAlignmentTest.php` covers:

1. Create event via API → DB row has `performed_at`, `cost_mad`, `type`, `odometer_km`, `vendor`.
2. `VehicleCostService::summary()` maintenance line equals sum of `cost_mad`.
3. `GET /api/v1/dashboard/fleet` includes period maintenance cost from events.
4. Legacy field names map correctly.
5. `cost_mad < 0` → HTTP 422.

Run: `php artisan test tests/Feature/MaintenanceSchemaAlignmentTest.php`

## Acceptance checklist

- No references to `event_date` or `cost` on `vehicle_maintenance_events` in app code.
- Maintenance cost aggregations use **`cost_mad`**.
- Date filtering uses **`performed_at`** consistently.
