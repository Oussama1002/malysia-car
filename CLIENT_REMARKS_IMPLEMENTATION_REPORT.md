# DriveFlow — Client Remarks Implementation Report

Date: 2026-05-05

## Summary

This rollout implements the client-tested business gaps across **fixed charges**, **vehicle identity & movements**, **maintenance/repair unavailability**, **reservations**, **fleet analysis**, **sub-rentals**, **alert commands**, and **contract payment methods**, using **real Laravel APIs + MySQL** (no mock data). Existing routes and workflows are preserved; new fields are additive.

---

## Per remark

### 1. Charges fixes (fixed charges)

**Implemented**

- Tables: `fixed_charges`, `fixed_charge_payments` ([`backend/database/migrations/2026_05_05_200000_client_remarks_schema.php`](backend/database/migrations/2026_05_05_200000_client_remarks_schema.php)).
- Models: `FixedCharge`, `FixedChargePayment`.
- Service: `FixedChargeService` (schedule generation, mark paid, optional accounting entry to expense + bank per mappings).
- API: `GET/POST /api/v1/fixed-charges`, `GET/PUT /api/v1/fixed-charges/{id}`, `GET /api/v1/fixed-charges/dashboard`, `POST /api/v1/fixed-charges/{id}/generate-payment`, `POST /api/v1/fixed-charge-payments/{id}/mark-paid`.
- Alerts: `driveflow:check-fixed-charge-alerts` → overdue refresh + notifications.
- Frontend: [`/finance/fixed-charges`](frontend/routes/AppRoutes.tsx) — [`FixedChargesPage.tsx`](frontend/modules/finance/FixedChargesPage.tsx).

**Limitations**

- Accounting posting requires configured chart accounts + active journal; skipped if mappings/accounts missing.

### 2–3. Vehicle identity / entry / exit / return / movements

**Implemented**

- Vehicle columns: ownership, physical status, location, current reservation link, chassis, transmission, unavailability reason ([migration](backend/database/migrations/2026_05_05_200000_client_remarks_schema.php)).
- Table `vehicle_movements` + model `VehicleMovement`.
- API: `POST /api/v1/vehicles/{vehicle}/entry|exit|return`, `GET /api/v1/vehicles/{vehicle}/movements`.
- Vehicle show payload includes `movements` and enriched `current` (customer, contract, reservation) ([`VehicleController`](backend/app/Http/Controllers/Api/V1/VehicleController.php)).
- Frontend: tabs **Identité** & **Mouvements** on [`FleetVehicleDetailPage.tsx`](frontend/modules/fleet/FleetVehicleDetailPage.tsx).

### 4. Maintenance / repairs & unavailability

**Implemented**

- `vehicle_maintenance_events`: `lifecycle_status`, `started_at`, `completed_at`.
- `VehicleOperationalService` centralizes unavailable flags and safe release after workshop.
- `RentalAvailabilityService` blocks reservations when `lifecycle_status = in_progress` on maintenance event or open repair.
- API: `POST /api/v1/maintenance-events/{maintenance_event}/start|complete`, `POST /api/v1/repairs/{repair}/start|complete`.
- Existing repair `store`/`update` integrated with unavailability workflow.

**Limitations**

- Legacy maintenance rows without `lifecycle_status` do not block until `start` is used.

### 5. Reservations visibility & flow

**Implemented**

- Columns: `payment_method`, `pickup_location`, `return_location` on `reservations`.
- API: `PUT/PATCH /api/v1/reservations/{id}`, `POST /api/v1/reservations/{id}/return` (alias of handover return).
- Frontend: label **Réservations / Locations** ([`fr.json`](frontend/locales/fr.json)); redirect `/reservations` → `/rentals`.

### 6. Fleet analysis / analyse de parc

**Implemented**

- `GET /api/v1/fleet/analysis` — [`FleetAnalysisService`](backend/app/Services/FleetAnalysisService.php) + [`FleetAnalysisController`](backend/app/Http/Controllers/Api/V1/FleetAnalysisController.php).
- Frontend: [`/fleet/analysis`](frontend/routes/AppRoutes.tsx) — [`FleetAnalysisPage.tsx`](frontend/modules/fleet/FleetAnalysisPage.tsx).

**Limitations**

- KPI “rented” is approximate from active-flow reservations; profitability loops vehicles (cap 500) — acceptable for medium fleets.

### 7. Sub-rental / sous-location

**Implemented**

- Tables: `supplier_agencies`, `sub_rental_contracts`.
- API: CRUD-style endpoints + `activate`, `return`, `close` ([`SubRentalController`](backend/app/Http/Controllers/Api/V1/SubRentalController.php)).
- Frontend: [`/fleet/sub-rentals`](frontend/modules/fleet/SubRentalsPage.tsx).

**Limitations**

- Full create/edit form for sub-rentals in UI is minimal (listing + supplier stub); API supports full lifecycle.

### 8. Alerts / notifications

**Implemented**

- Commands registered in [`routes/console.php`](backend/routes/console.php):
  - `driveflow:check-maintenance-alerts` (alias → existing maintenance due)
  - `driveflow:check-compliance-alerts` (alias → compliance expiry)
  - `driveflow:check-contract-alerts`
  - `driveflow:check-reservation-alerts`
  - `driveflow:check-fixed-charge-alerts`
- Shared normaliser [`PaymentMethodNormalizer`](backend/app/Support/PaymentMethodNormalizer.php) and [`ErpConstants`](backend/app/Support/ErpConstants.php).

**Limitations**

- GPS-specific alerts reuse existing GPS/compliance stacks; no new GPS rule engine in this pass.

### 9. Contract payment method

**Implemented**

- Columns on `contracts`: `payment_method`, `payment_terms`, `bank_reference`, `cheque_number`, `expected_payment_day`.
- Activation requires **payment_method** and **cheque_number** if **check**; virement reference optional (“if applicable”).
- [`ContractResource`](backend/app/Http/Resources/ContractResource.php) + wizard & detail UI updates.

---

## Tests added

- [`backend/tests/Feature/ClientRemarksRoutesTest.php`](backend/tests/Feature/ClientRemarksRoutesTest.php) — unauthenticated 401 smoke for new endpoints.

---

## Commands to validate locally

```bash
cd backend && php artisan migrate --force && php artisan test
cd frontend && npm run build
```

---

## Files touched (high level)

- Backend: `routes/api.php`, `routes/console.php`, migrations, models, services, controllers listed above.
- Frontend: `AppRoutes.tsx`, `AppLayout.tsx`, `fr.json`, fleet/finance pages, `FleetVehicleDetailPage.tsx`, `ContractWizardPage.tsx`, `ContractDetailPage.tsx`, `contractsApi.ts`, `dtos.ts`, `queryKeys.ts`.

---

## Remaining limitations

1. Sub-rental UI is intentionally lightweight vs full wizard.
2. Fleet analysis performance for very large fleets may require pagination/caching.
3. Fixed-charge accounting posting depends on accounting seed/configuration.
4. DB migration must succeed in target environment (FKs to `accounting_accounts`, `accounting_entries`, `files`).
