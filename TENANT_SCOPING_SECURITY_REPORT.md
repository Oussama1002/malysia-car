# TENANT_SCOPING_SECURITY_REPORT

## Goal

Enforce tenant-safe row-level access to prevent cross-company and cross-branch exposure across API resources.

## Findings (pre-fix)

Audit and code scan identified broad use of controller queries without guaranteed tenant filters (`company_id`, `branch_id`) in sensitive domains:

- customers
- vehicles
- contracts
- reservations
- missions
- invoices
- payments
- signatures
- arrears / legal
- used cars
- generated documents

Multiple controllers relied on open `Model::query()` patterns and implicit route-model binding without centralized tenant checks.

## Reusable scoping strategy implemented

### 1) Model-level tenant scope trait

- Added `backend/app/Support/TenantScope.php`
- Provides:
  - global tenant filtering by authenticated user
  - `company_id` isolation for all scoped models
  - branch restriction for non `ADMIN`/`DIRECTEUR`
  - client-portal restriction by `customer_id` where relevant
  - reusable `scopeForTenant()` helper

### 2) Tenant route guard middleware

- Added `backend/app/Http/Middleware/EnsureTenantScope.php`
- Validates route-bound models at runtime:
  - reject cross-company entities
  - reject cross-branch entities for non-privileged users
  - reject cross-customer entities for `CLIENT_PORTAL`
- Returns `404` for out-of-tenant resources (defense-in-depth against enumeration).

### 3) Base controller helper

- Added `backend/app/Http/Controllers/Api/V1/BaseApiController.php`
- Exposes `scoped(...)` query helper for consistent future controller implementations.

### 4) Global API middleware wiring

- Updated `backend/bootstrap/app.php`:
  - registered alias `tenant.scope`
- Updated `backend/routes/api.php`:
  - authenticated API group now uses `['auth:sanctum', 'tenant.scope']`

## Model scoping coverage applied

`TenantScope` trait added to:

- `Customer`
- `Vehicle`
- `Contract`
- `Reservation`
- `Mission`
- `Invoice`
- `Payment`
- `SignatureEnvelope`
- `ArrearsCase`
- `UsedCarListing`
- `GeneratedDocument`

Additional legal domain protection:

- `LegalCase` now enforces tenant scope via related `arrearsCase` (`company_id` + branch constraints).

## CLIENT_PORTAL hardening

- Added user linkage support for customer-bound scoping:
  - migration: `backend/database/migrations/2026_05_01_020000_add_customer_id_to_users_table.php`
  - user model updated to include `customer_id` fillable.
- `CLIENT_PORTAL` access to customer-owned data now requires matching `users.customer_id`.

## Route model binding protection

Implemented centrally via `tenant.scope` middleware:

- entity from another company => `404`
- entity from another branch for non-privileged user => `404`
- `CLIENT_PORTAL` trying to access another customer’s entity => `404`

## Scoping rules documented

1. Every authenticated request is tenant-scoped by `company_id`.
2. `ADMIN`/`DIRECTEUR` can access all branches inside their company.
3. Non-privileged users are constrained to `branch_id` when resource has a branch dimension.
4. `CLIENT_PORTAL` is constrained to resources with matching `customer_id` when applicable.
5. Route-bound entities outside tenant scope are treated as not found.

## Tests added

New file:

- `backend/tests/Feature/TenantScopingSecurityTest.php`

Cases:

1. user from company A cannot access company B customer
2. branch user cannot access other branch vehicle
3. client portal cannot access another customer contract (and can access own)

## Test results

Executed:

- `php artisan test --filter=TenantScopingSecurityTest` -> **PASS**
- `php artisan test --filter=KycControllerTest` -> **PASS**
- `php artisan test --filter=ReservationAvailabilityTest` -> **PASS**

## Acceptance criteria status

- no cross-company data exposure: **implemented via model scope + route middleware**
- sensitive controllers enforce tenant scoping: **implemented centrally**
- branch scoping consistent: **implemented for non ADMIN/DIRECTEUR**
- tests pass: **yes**

