# DriveFlow — Fleet validation UUID alignment

**Date:** 2026-05-02  

## Problem

`StoreVehicleRequest` / `UpdateVehicleRequest` validated `brand_id` and `model_id` as **integers**, while migrations define **`vehicle_brands.id`** and **`vehicle_models.id`** as **UUID** strings.

## Backend changes

### Form requests

- **`brand_id`:** `nullable`, `uuid`, `exists:vehicle_brands,id`
- **`model_id`:** `nullable`, `uuid`, `exists:vehicle_models,id`

Files:

- `app/Http/Requests/Api/V1/Fleet/StoreVehicleRequest.php`
- `app/Http/Requests/Api/V1/Fleet/UpdateVehicleRequest.php`

### API responses

`VehicleResource` now exposes **`brand_id`** and **`model_id`** so the UI can pre-fill catalog selects when editing a vehicle (name matching alone is fragile).

### Catalogue endpoint

`VehicleBrandController` lists models using the **`name`** column on `vehicle_models` (aligned with `VehicleModel::$fillable` and the create migration).

### Seeder

`VehicleBrandSeeder` uses `VehicleModel::firstOrCreate(..., ['name' => $modelName])` instead of the nonexistent `model_name` attribute.

### Vehicle year column (SQLite / schema truth)

The `vehicles` table column is **`year`**. The model previously used **`year_of_manufacture`**, which caused inserts to fail against the real schema (discovered when exercising `POST /api/v1/vehicles` in tests).

Aligned:

- `Vehicle` `$fillable`: `year` (replacing `year_of_manufacture`)
- `VehicleController` store/update: assign `$vehicle->year`
- `VehicleResource`: read `$v->year`

## Frontend changes (`frontend/screens/VehiclesList.tsx`)

- Brand/model option **`id`** types are **`string`** (UUID).
- Form state **`brand_id` / `model_id`** are **`string | null`** (no `Number()` coercion).
- Select handlers keep UUID strings end-to-end.
- **`GET /v1/vehicles`** mapping stores **`brand_id`** / **`model_id`** from the API.
- Edit modal prefers **`v.brand_id` / `v.model_id`** when present, then falls back to name matching.
- Submit payload includes **`brand_id` / `model_id`** only when set (optional catalog).

`frontend/types.ts` **`Vehicle`** interface: optional **`brand_id`**, **`model_id`**; **`id`** widened to **`string | number`**.

## Tests

`tests/Feature/VehicleFleetUuidValidationTest.php`:

1. **Create** vehicle with UUID `brand_id` / `model_id` → **201**, DB rows match.
2. **Reject** numeric `brand_id` (`1`) → **422** (`uuid` rule).
3. **Update** `model_id` to another UUID under the same brand → **200**, persisted.

Run:

```bash
cd backend && php artisan test tests/Feature/VehicleFleetUuidValidationTest.php
```

## Acceptance

| Requirement | Status |
|-------------|--------|
| No integer vs UUID mismatch on brand/model validation | Done |
| Vehicle create/update works with UUID FKs | Covered by tests + `year` column fix |
