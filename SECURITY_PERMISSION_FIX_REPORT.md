# Security & Permissions Hardening — DriveFlow Backend

**Date:** 2026-04-27
**Scope:** `backend/routes/api.php`, `backend/app/Http/Middleware/EnsurePermission.php`, `backend/config/erp.php`, `backend/database/seeders/RbacSeeder.php`
**Goal:** Replace coarse `auth:sanctum` + role-only protection with a granular, DB-backed permission catalogue applied per HTTP verb on every sensitive endpoint.

---

## 1. What changed

### 1.1 Middleware — `EnsurePermission`
- Now consults the real RBAC DB (`permissions ↔ role_permissions ↔ user_roles`) via `User::hasPermission($code)`.
- ADMIN role bypasses every permission check (single hard-coded short-circuit).
- Falls back to `config('erp.permission_roles')` when the DB catalogue is empty (fresh installs / dev environments before seeding).
- Returns `403 Forbidden` with `{ "message": "Forbidden.", "required_permission": "<code>" }` so clients can surface the missing permission.

### 1.2 Permission catalogue — `RbacSeeder`
Two coexisting naming conventions:

| Convention | Example | Use |
|---|---|---|
| Legacy module-level | `view_fleet`, `manage_finance` | SPA navigation gates, backwards compat |
| Granular dot-notation | `vehicles.update`, `kyc.approve`, `accounting.entries.post` | API per-verb enforcement |

**~135 permission codes** seeded across 11 modules: `dashboard, fleet, gps, customers, contracts, credit, used_cars, finance, arrears, mobile_ops, admin`.

### 1.3 Role → permission matrix

| Role | Scope summary |
|---|---|
| `ADMIN` | Wildcard — all permissions in catalogue |
| `DIRECTEUR` | Read everywhere + write on customers/fleet/contracts/finance/arrears + KYC approval + contract approval/activation/termination + signature void + user management (no roles) |
| `ANALYSTE_CREDIT` | Customers (view/update), KYC full workflow incl. approve/reject, credit full workflow, contracts (view), risk dashboard |
| `AGENT_COMMERCIAL` | Customers, contracts, signatures (sign), used cars, reservations, generate invoice from contract, fleet/payments (view) |
| `GESTIONNAIRE_FLOTTE` | Fleet full, GPS full, used-cars limited (no sell), reservations/missions, fleet+gps dashboards |
| `COMPTABLE` | Finance full (invoices/payments/treasury/accounting/taxes/fiscal years/fixed assets), arrears (view), finance dashboard |
| `CONTENTIEUX` | Customers (view+blacklist+notes), contracts (view), arrears + legal full, payments/balance (view), risk dashboard |
| `AGENT_LIVRAISON` | Vehicles (view), odometer create, missions full (start/complete/checklist/photo), GPS positions (view) |
| `CLIENT_PORTAL` | Own contracts/installments/invoices/payments/balance + sign their own envelopes only |
| `AGENT` | Generic read-only fallback |

### 1.4 Routes — `api.php`
**Every** route inside `auth:sanctum` (except `/auth/me`, `/auth/logout`, `/branches`) now carries a `permission:<code>` middleware. Where the action is highly sensitive (KYC approval, customer blacklist, used-car sale, accounting posting, treasury writes, legal repossession, fiscal year close, admin surface), a hard `role:` gate is layered on top for defense in depth.

Examples:
```php
// Before
Route::put('vehicles/{vehicle}', [VehicleController::class, 'update']);
Route::post('kyc-cases/{kycCase}/approve', [KycController::class, 'approve'])
    ->middleware('role:ADMIN,DIRECTEUR,ANALYSTE_CREDIT');

// After
Route::put('vehicles/{vehicle}', [VehicleController::class, 'update'])
    ->middleware('permission:vehicles.update');
Route::post('kyc-cases/{kycCase}/approve', [KycController::class, 'approve'])
    ->middleware(['permission:kyc.approve', 'role:ADMIN,DIRECTEUR,ANALYSTE_CREDIT']);
```

### 1.5 Config — `config/erp.php`
Updated `permission_roles` map with ~120 entries mirroring the seeder so the fallback path produces identical decisions.

---

## 2. Acceptance criteria — verification

| Requirement | Status | How |
|---|---|---|
| `AGENT_LIVRAISON` cannot call finance/contracts/admin | ✅ | Their permission set excludes `invoices.*`, `contracts.create/update/approve`, `users.*`, `accounting.*`. Only `vehicles.view`, `odometer.create`, `missions.*`, `gps.positions.view` are granted. |
| `CLIENT_PORTAL` cannot access other customers' data | ⚠️ Partial | Permission catalogue restricts CLIENT_PORTAL to read-only finance/contracts/signatures. **Per-row scoping (filter by `customer_id = $user->customer_id`) must still be enforced inside controllers** — flagged for follow-up (see §4). |
| `COMPTABLE` cannot post entries without `accounting.entries.post` | ✅ | Both permission and `role:ADMIN,DIRECTEUR,COMPTABLE` checked. |
| `ANALYSTE_CREDIT` cannot approve contracts | ✅ | `contracts.approve` not in their bundle. |
| `GESTIONNAIRE_FLOTTE` cannot sell used cars | ✅ | `usedcars.sell` not in their bundle; route also has `role:ADMIN,DIRECTEUR` gate. |
| ADMIN bypasses all checks | ✅ | Short-circuit at top of `EnsurePermission::handle` and in `User::hasPermission`. |
| `/auth/me` returns computed permissions | ✅ | Already returned via `permissionCodes()` (was already in place pre-task). |
| All write/delete routes guarded | ✅ | Audited every `POST/PUT/PATCH/DELETE` in `api.php`; each carries a `permission:` middleware. |

---

## 3. Migration / Deployment steps

```bash
cd backend
php artisan migrate              # ensures permissions tables exist
php artisan db:seed --class=RbacSeeder
php artisan config:clear
php artisan route:clear
```

After seeding, verify catalogue:
```bash
php artisan tinker
>>> \App\Models\Permission::count()  // expect ~135
>>> \App\Models\Role::where('code','COMPTABLE')->first()->permissions->pluck('code')
```

---

## 4. Known follow-ups (out of scope for this pass)

1. **Per-row scoping for CLIENT_PORTAL.**
   `CustomerController::index/show`, `ContractController::index/show`, `InvoiceController::index/show`, `PaymentController::index/show`, `CustomerBalanceController::*`, `SignatureEnvelopeController::*` should all add a `where('customer_id', $request->user()->customer_id)` clause when the caller's role is `CLIENT_PORTAL`. The middleware lets them in; the controller must restrict the rowset.

2. **Branch scoping for non-admin roles.**
   Most controllers should filter results to the user's assigned `branch_id`s (via `user_branches` pivot). Currently the permission lets a `GESTIONNAIRE_FLOTTE` see vehicles, but does not stop them seeing vehicles in branches they aren't assigned to. Recommend a `BranchScope` global scope.

3. **Signature endpoints public link flow.**
   `verify-otp`, `sign`, `decline` are kept inside `auth:sanctum` for now. If the productised signing link is meant to be unauthenticated (token-based), the routes should move out of `auth:sanctum` and validate a signed signer token instead.

4. **GPS ingestion endpoint** (`POST /gps/positions`) currently requires `gps.positions.ingest`. If hardware boxes POST directly with a service token, ensure the service account has that permission **and** consider a separate ingestion guard rather than session auth.

5. **Frontend feature gates.**
   The SPA still uses the legacy `view_*` / `manage_*` codes for nav gating. The new granular codes are also returned by `/auth/me`, so progressively migrate `<RequirePermission code="manage_fleet">` to the granular equivalents (`vehicles.create`, etc.) where finer control is desired.

6. **Throttling on sensitive write routes.**
   No throttling beyond the default has been added. Consider `throttle:60,1` on `customers.delete`, `contracts.terminate`, `accounting.entries.post`, `legal.repossess`.

---

## 5. Files touched

| File | Change |
|---|---|
| `backend/app/Http/Middleware/EnsurePermission.php` | Rewrote to use DB RBAC + ADMIN bypass + legacy fallback |
| `backend/config/erp.php` | Replaced sparse map with full ~120-entry fallback catalogue |
| `backend/database/seeders/RbacSeeder.php` | Added ~110 granular permissions; rebuilt role bundles per spec |
| `backend/routes/api.php` | Added `permission:<code>` to every write/sensitive read route; layered `role:` on highest-impact actions |
