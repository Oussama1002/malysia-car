# DriveFlow — Fleet & maintenance schema alignment report

**Date:** 2026-05-03  
**Goal:** Remove drift between legacy maintenance field names and the canonical DB / API; align vehicle brand/model validation with UUID schema.

## Canonical schema (reference)

| Table / model | Legacy (avoid in new code) | Canonical |
|---------------|---------------------------|-----------|
| `vehicle_maintenance_events` | `event_date`, `cost`, `event_type` (as only key) | `performed_at`, `cost_mad`, `type` |
| Request compatibility | `completed_date`, `cost_amount`, `mileage_at_service`, `vendor_name` | Merged in `StoreMaintenanceEventRequest::prepareForValidation()` → canonical |
| `vehicles` | `current_mileage`, `make`/`model` columns only | `mileage_current`, `brand_id` / `model_id` (UUID) + optional `brand_name` / `model_name` |
| `vehicle_brands` / `vehicle_models` | `integer` IDs | **UUID** primary keys (`2026_04_23_120000` / `120010` migrations) |

## Code changes

### 1. `StoreMaintenanceEventRequest`

- Merges **`event_date` → `performed_at`** and **`cost` → `cost_mad`** in addition to existing legacy aliases (`event_type`, `completed_date`, `cost_amount`, …).

### 2. `MaintenanceMonitoringController`

- **`monthlyMaintenanceCost`:** Uses `whereDate` on `performed_at` within the current calendar month, **`COALESCE(SUM(COALESCE(cost_mad, 0)), 0)`** so null costs do not break totals.
- **`upcomingMaintenanceCount`:** No longer relies on `status = 'due_soon'` (plans often keep `status = 'ok'`). Counts active plans whose **`next_due_at`** falls between **today** and **today + 30 days**.

### 3. `StoreVehicleRequest` / `UpdateVehicleRequest`

- **`brand_id` / `model_id`:** Already **`uuid` + `exists:vehicle_brands,id` / `vehicle_models,id`**.
- **`model_id`:** Added **`Rule::exists('vehicle_models', 'id')->where('brand_id', …)`** when a brand context applies:
  - **Create:** constrain to submitted `brand_id` when present.
  - **Update:** use submitted `brand_id` if filled, else fall back to **`$this->route('vehicle')->brand_id`** so partial updates still validate the model against the current or new brand.

### 4. `VehicleMaintenanceEvent` model

- Docblock corrected: **`vendor`** is a nullable string in the migration, not a numeric PK.

### 5. Frontend — `FleetVehicleDetailPage.tsx` (`MaintenanceEventForm`)

- Submits **canonical** JSON: `type`, `performed_at`, `odometer_km`, `vendor`, `cost_mad`.
- Removed non-schema **`status: 'completed'`** from the maintenance-event POST body.

### 6. Services / controllers already canonical

- `VehicleMaintenanceEventController`, `MaintenanceService`, and `DashboardController` maintenance aggregations already used **`performed_at`** / **`cost_mad`**; no further changes required there.

## Tests

| File | Purpose |
|------|---------|
| `tests/Feature/MaintenanceSchemaAlignmentTest.php` | Extended with **`event_date` + `cost`** legacy mapping test and **`GET /api/v1/maintenance/alerts`** monthly cost assertion (125.5 MAD from two seeded rows). |
| `tests/Feature/FleetVehicleBrandModelValidationTest.php` | **New:** vehicle **create** rejects model from another brand; **create** succeeds with matching UUIDs; **update** rejects mismatched `model_id`. |

Run:

```bash
cd backend
php artisan test --filter=MaintenanceSchemaAlignmentTest
php artisan test --filter=FleetVehicleBrandModelValidationTest
```

## Frontend build

```bash
cd frontend && npm run build
```

Completed successfully after `MaintenanceEventForm` updates.

## Acceptance checklist

| Criterion | Status |
|-----------|--------|
| No backend business logic querying non-existent maintenance columns (`event_date`, row `cost`, `event_type` as DB column) | ✅ DB uses `performed_at` / `cost_mad` / `type`; legacy **input** keys only in `prepareForValidation` |
| Vehicle create/update validation matches UUID schema | ✅ `uuid` + `exists` + brand/model consistency rule |
| Maintenance monitoring cost KPI correct | ✅ Sum of `cost_mad` in current month |
| Tests pass | ✅ See commands above |
| `npm run build` passes | ✅ |

---

*For new API clients, prefer canonical field names; legacy keys remain supported only for backward compatibility in `StoreMaintenanceEventRequest`.*
