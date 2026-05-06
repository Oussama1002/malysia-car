# SUB_RENTAL_MODULE_COMPLETION_REPORT

## What Was Missing Before

The DriveFlow ERP had no mechanism to track vehicles sourced externally from supplier agencies. The existing fleet assumed all vehicles were owned. There was no:
- Supplier agency registry
- Sub-rental contract lifecycle (draft → active → returned → closed)
- External vehicle identity tracking
- Supplier cost / customer revenue margin computation
- Sub-rental period constraint enforcement in availability checks
- Supplier return alerts

---

## Database Changes

### New Tables

| Table | Purpose |
|---|---|
| `supplier_agencies` | Registry of external agencies from which vehicles are sub-rented |
| `sub_rental_contracts` | Full lifecycle of each sub-rental agreement, including external vehicle identity (JSON), costs, dates, status, and payment tracking |
| `sub_rental_payments` | Payments made to the supplier for a given contract |
| `sub_rental_return_reports` | Return inspection report created when the vehicle is returned to the supplier |

### Modified Tables

| Table | Change |
|---|---|
| `vehicles` | Added `ownership_status` column (enum: `owned`, `sub_rented`), default `owned` |

---

## Backend — New Files

| File | Description |
|---|---|
| `database/migrations/2026_05_06_100000_create_sous_location_tables.php` | Migration for all 4 new tables + vehicles column |
| `app/Models/SupplierAgency.php` | Eloquent model with TenantScope, SoftDeletes, UUID PK, helper methods |
| `app/Models/SubRentalContract.php` | Model with JSON cast on external_vehicle_identity, date casts, business methods (margin, totalPaid, isOverdue, isReturnDueSoon) |
| `app/Models/SubRentalPayment.php` | Model with auto payment-status sync on creation |
| `app/Models/SubRentalReturnReport.php` | One-per-contract return inspection model |
| `app/Services/SubRentalService.php` | Core business logic: create, activate (with temp vehicle creation), return, close, profitability |
| `app/Services/SubRentalAlertService.php` | Daily alert dispatch for return due in 3d, 1d, overdue, blacklisted agency contracts |
| `app/Http/Controllers/Api/V1/SupplierAgencyController.php` | CRUD for agencies with active contract guard on delete |
| `app/Http/Controllers/Api/V1/SubRentalController.php` | Full contract lifecycle: index, store, update, activate, return, close, profitability, dashboard, uploadDocument |
| `app/Http/Controllers/Api/V1/SubRentalPaymentController.php` | Payment index and store with summary response |
| `app/Console/Commands/CheckSubRentalAlertsCommand.php` | Artisan command `driveflow:check-sub-rental-alerts` |

## Backend — Modified Files

| File | Change |
|---|---|
| `routes/api.php` | 14 new routes under `/v1/supplier-agencies` and `/v1/sub-rentals` |
| `config/erp.php` | 10 new permission codes with role mappings |
| `database/seeders/RbacSeeder.php` | 10 new DB-backed permissions, assigned to DIRECTEUR / GESTIONNAIRE_FLOTTE / COMPTABLE / CONTENTIEUX |
| `app/Models/Vehicle.php` | Added `ownership_status` to fillable, `subRentalContracts()` relation, `isSubRented()` helper |
| `app/Services/RentalAvailabilityService.php` | Sub-rental period constraint block: customer reservation cannot exceed supplier contract dates |
| `routes/console.php` | Daily schedule at 08:00 for the alerts command |

---

## API Endpoints

### Supplier Agencies
```
GET    /api/v1/supplier-agencies                    supplier_agencies.view
POST   /api/v1/supplier-agencies                    supplier_agencies.manage
GET    /api/v1/supplier-agencies/{id}               supplier_agencies.view
PUT    /api/v1/supplier-agencies/{id}               supplier_agencies.manage
DELETE /api/v1/supplier-agencies/{id}               supplier_agencies.manage
```

### Sub-Rental Contracts
```
GET    /api/v1/sub-rentals/dashboard                sub_rentals.view
GET    /api/v1/sub-rentals                          sub_rentals.view
POST   /api/v1/sub-rentals                          sub_rentals.create
GET    /api/v1/sub-rentals/{id}                     sub_rentals.view
PATCH  /api/v1/sub-rentals/{id}                     sub_rentals.update
POST   /api/v1/sub-rentals/{id}/activate            sub_rentals.activate
POST   /api/v1/sub-rentals/{id}/return              sub_rentals.return
POST   /api/v1/sub-rentals/{id}/close               sub_rentals.close
GET    /api/v1/sub-rentals/{id}/profitability       sub_rentals.view
POST   /api/v1/sub-rentals/{id}/documents           sub_rentals.documents
GET    /api/v1/sub-rentals/{id}/payments            sub_rentals.payments
POST   /api/v1/sub-rentals/{id}/payments            sub_rentals.payments
```

---

## Permissions

| Code | Roles |
|---|---|
| `supplier_agencies.view` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE, COMPTABLE, CONTENTIEUX |
| `supplier_agencies.manage` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE |
| `sub_rentals.view` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE, COMPTABLE, AGENT_COMMERCIAL, CONTENTIEUX |
| `sub_rentals.create` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE |
| `sub_rentals.update` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE |
| `sub_rentals.activate` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE |
| `sub_rentals.return` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE |
| `sub_rentals.close` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE |
| `sub_rentals.payments` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE, COMPTABLE |
| `sub_rentals.documents` | ADMIN, DIRECTEUR, GESTIONNAIRE_FLOTTE |

---

## Frontend — New Files

| File | Description |
|---|---|
| `frontend/services/subRentalApi.ts` | TypeScript API client for all sub-rental endpoints |
| `frontend/modules/subRentals/SubRentalsPage.tsx` | KPI dashboard + filterable contract list |
| `frontend/modules/subRentals/SubRentalCreatePage.tsx` | New contract form (existing vehicle or external identity) |
| `frontend/modules/subRentals/SubRentalDetailPage.tsx` | 6-tab detail page with lifecycle actions (activate, return, close, payment) |
| `frontend/modules/subRentals/SupplierAgenciesPage.tsx` | Agency CRUD page with inline modal |

## Frontend — Modified Files

| File | Change |
|---|---|
| `frontend/domain/appRole.ts` | Added `subRentals` to ModuleKey union and role access maps |
| `frontend/modules/layout/AppLayout.tsx` | Added "Sous-location" nav item in operations group |
| `frontend/locales/fr.json` | Added `nav.subRentals` translation |
| `frontend/locales/en.json` | Added `nav.subRentals` translation |
| `frontend/routes/AppRoutes.tsx` | 4 new routes under `/fleet/sub-rentals` and `/fleet/supplier-agencies` |

---

## Frontend Routes

| Path | Component |
|---|---|
| `/fleet/sub-rentals` | SubRentalsPage |
| `/fleet/sub-rentals/new` | SubRentalCreatePage |
| `/fleet/sub-rentals/:id` | SubRentalDetailPage |
| `/fleet/supplier-agencies` | SupplierAgenciesPage |

---

## Business Logic Highlights

### Activation
- Blocks if agency is blacklisted or inactive
- If no `vehicle_id` is provided, creates a temporary Vehicle record with `ownership_status = sub_rented` using brand/model firstOrCreate
- Sets vehicle `availability_status = available` so it appears in the rentable fleet

### Return to Supplier
- Blocks if there is an active customer Reservation linked to the vehicle
- Creates a `SubRentalReturnReport` record
- Resets vehicle `ownership_status = owned` and `availability_status = unavailable`

### Availability Constraint
- `RentalAvailabilityService::evaluate()` checks: if `vehicle.ownership_status == sub_rented`, the customer reservation dates must fall within the active sub-rental contract period. If not, reason `sub_rental_period_exceeded` is appended.

### Profitability
- `supplier_cost` = `total_cost` on the contract
- `customer_revenue` = sum of all Rental/Reservation revenue for the linked vehicle during the sub-rental period
- `margin` = `customer_revenue - supplier_cost`

### Alerts (daily at 08:00)
- Return due in 3 days → priority `high`
- Return due in 1 day → priority `urgent`
- Overdue (past end_date, still active) → priority `urgent`
- Active contract with blacklisted agency → priority `high`
- Deduplication: no duplicate notification within 24h for the same user + entity + category

---

## Feature Tests

`tests/Feature/SubRentalTest.php` — 13 test cases:

1. `test_create_supplier_agency` — POST creates agency with correct fields
2. `test_list_supplier_agencies` — GET returns seeded agencies
3. `test_cannot_delete_agency_with_active_contracts` — 422 guard
4. `test_create_sub_rental_with_external_vehicle_identity` — POST creates draft contract
5. `test_activate_contract_creates_sub_rented_vehicle` — activation creates Vehicle record
6. `test_activate_contract_with_linked_vehicle_marks_it_sub_rented` — ownership_status updated
7. `test_cannot_activate_contract_for_blacklisted_agency` — 422 guard
8. `test_add_payment_and_payment_status_updates` — partial payment syncs payment_status
9. `test_full_payment_marks_contract_paid` — full payment sets paid
10. `test_profitability_endpoint_returns_correct_structure` — profitability JSON shape
11. `test_return_to_supplier_resets_vehicle_ownership` — ownership_status reverts to owned
12. `test_dashboard_returns_expected_keys` — dashboard JSON shape
13. `test_cannot_close_unpaid_contract_without_force` — 422 guard
14. `test_can_force_close_unpaid_contract_as_admin` — force_close=true allowed
15. `test_update_blocked_on_non_draft_contract` — 422 guard
16. `test_list_sub_rentals_filters_by_status` — ?status=active filters correctly

---

## Known Limitations

- **Document storage**: `uploadDocument` endpoint stores to `local` disk. Production deployments using S3/R2 should update the disk setting in `config/filesystems.php` and the controller.
- **Profitability real-time revenue**: `customer_revenue` in `SubRentalService::computeProfitability()` sums reservations from the `reservations` table. If the project uses a different table name or billing model, the query should be adjusted.
- **Duplicate vehicle creation**: If `activateContract()` is called twice with the same external registration number in different contracts, a second Vehicle record will be created. A unique index on `(company_id, registration_number)` would prevent this at the DB level but is not added by this migration to avoid breaking existing data.
- **Soft deletes on contracts**: `SubRentalContract` uses `SoftDeletes`; hard-deleted agencies cannot cascade-delete contracts because of the soft-delete constraint. The destroy guard in `SupplierAgencyController` prevents deleting agencies with active or draft contracts.
