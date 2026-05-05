# DriveFlow — Dashboard SQL / schema alignment report

**Date:** 2026-05-03  
**Scope:** `backend/app/Http/Controllers/Api/V1/DashboardController.php` aligned with current migrations and Eloquent models.

## Summary

All dashboard segments (`executive`, `finance`, `risk`, `fleet`, `gps`) now query **only columns that exist** in the current schema (Phase 3–14 migrations). KPI definitions follow the audit rules: **issued invoices** for revenue, **balance-based overdue**, **payment allocations by `payments.payment_date`** for cash applied in period, **vehicle `book_value` / `purchase_price`** for fleet book value, **`vehicle_maintenance_events.cost_mad`** for maintenance cost, **`vehicles.mileage_current`** for fleet overrun checks, and **GPS alerts** using `vehicle_id`, `status`, and `resolved_at` (no legacy `device_id` / `is_resolved`).

## Legacy → current column mapping

| Area | Incorrect / legacy assumption | Current schema (source) |
|------|--------------------------------|-------------------------|
| Invoices | `invoice_date`, `paid_amount` | `issue_date`, `total_amount`, `amount_paid`, `amount_due`, `tax_amount`, `due_date`, `status` (`2026_04_23_170000_create_phase10_invoicing_payments_tables.php`) |
| Revenue recognition | All rows including `draft` | Only **`issued`, `partial`, `paid`, `overdue`** (`Invoice` + controller `issuedInvoiceStatuses()`) |
| Overdue | `status = overdue` only | **`due_date` &lt; today AND `amount_due` &gt; 0** on issued-status invoices (matches open balance) |
| Payments / paid KPI | Allocations joined on **invoice `issue_date`** | **Allocations joined on `payments.payment_date`** in range (`payment_allocations` + `payments`) |
| Credit | `credit_applications.status` | **`decision_status`** (`draft`, `pending`, …) |
| GPS | `is_resolved`, `device_id` | **`resolved_at`**, **`status`**, `vehicle_id`, `gps_device_id` (`gps_alerts` migration) |
| Vehicles | `active`, `make`/`model` only | **`status`** (e.g. `AVAILABLE`, `SOLD`), **`brand_id` / `model_id`** + optional **`brand_name` / `model_name`**, **`mileage_current`** (`2026_04_23_120020_create_vehicles_table.php`) |
| Maintenance | `event_date`, `cost`, `event_type` | **`performed_at`**, **`cost_mad`**, **`type`** (`vehicle_maintenance_events` + `VehicleMaintenanceEvent` model) |

## KPI formulas (implemented)

### Executive

- **Fleet book value (`fleet_value_mad`):**  
  `SUM(COALESCE(book_value, purchase_price, 0))` on `vehicles` where `status != 'SOLD'` (optionally filtered by `branch_id`).
- **`fleet_fixed_asset_vnc_mad`:**  
  Sum `book_value` on `fixed_assets` where `category = 'vehicle'` and `status = 'active'` (if table exists).
- **Monthly revenue:**  
  Sum `total_amount` for invoices with `status ∈ issued set` and `issue_date >= now()-30 days`.
- **Overdue rate:**  
  `sum(amount_due)` for issued invoices with `due_date < today` and `amount_due > 0`, divided by **issued** `total_amount` in the selected `from`/`to` window.
- **Maintenance cost (profitability slice):**  
  Sum `COALESCE(cost_mad,0)` on `vehicle_maintenance_events` with `performed_at` in `from`/`to`.
- **Pending credit:**  
  `COUNT(*)` on `credit_applications` where `decision_status IN ('pending','draft')`.
- **GPS alerts today:**  
  Alerts with `DATE(triggered_at) = today` and (`resolved_at IS NULL` **OR** `status = 'open'`).

### Finance

- **Revenue (`invoiced.total`):**  
  `SUM(total_amount)` for **issued** invoices with `issue_date` in range.
- **Outstanding (`invoiced.outstanding`):**  
  `SUM(amount_due)` for those same invoices (period = issue_date window).
- **Paid (`invoiced.paid`):**  
  `SUM(payment_allocations.amount_allocated)` where `payments.payment_date` is in range and allocation has `invoice_id` (canonical **cash applied** view).
- **`invoice_amount_paid_field`:**  
  `SUM(invoices.amount_paid)` for issued invoices with `issue_date` in range (reconciliation / AR view).
- **Overdue block:**  
  Same balance rule as executive: `due_date < today`, `amount_due > 0`, issued statuses.
- **VAT:**  
  `SUM(tax_amount)` on issued invoices in `issue_date` range.

### Fleet

- **Maintenance cost period:**  
  `SUM(COALESCE(cost_mad,0))` with `performed_at` in range.
- **KM overrun:**  
  `vehicles.mileage_current` vs `contracts.allowed_km` for `contracts.status IN ('active','signed')` (numeric-safe cast on SQLite).
- **Scheduled maintenance:**  
  `vehicle_maintenance_plans.next_due_at` in next 30 days when table exists.

### GPS

- **Top speeding:**  
  Join `vehicles` → `vehicle_brands` / `vehicle_models`; display names as  
  `COALESCE(brand.name, vehicles.brand_name)` and `COALESCE(model.name, vehicles.model_name)` so denormalized names are not required.
- **Devices:**  
  Queries wrapped with `Schema::hasTable('gps_devices')` so environments without GPS hardware tables do not error.

### Risk

- Unchanged table usage: `arrears_cases`, `credit_applications.decision_status`, `legal_cases`, `repossession_orders` — all columns verified against Phase 12 migration.

## Implementation notes

- **Eloquent vs DB:**  
  `Invoice`, `Payment`, `Vehicle`, and `CreditApplication` are used where they simplify tenant-safe, readable queries; raw `DB::table` kept for complex joins (GPS top list, finance top overdue with profile joins).
- **`branch_id`:**  
  Read via `$request->input('branch_id')` (query or body) for consistency.
- **SQLite / MySQL month buckets:**  
  `sqlMonthKeyExpr()` continues to branch on driver; `GROUP BY` uses `DB::raw()` on the same expression as the select alias to satisfy `ONLY_FULL_GROUP_BY` on MySQL.

## Tests

- **File:** `backend/tests/Feature/DashboardControllerTest.php`
- **Coverage:**
  - `GET /api/v1/dashboard/{executive,finance,risk,fleet,gps}` → **200** and JSON `data` present (no “column not found”).
  - Seeded **invoice + payment + allocation** → finance `invoiced.total`, `paid`, `outstanding`, `overdue` match **1000 / 750 / 250 / 250**.
  - Seeded **vehicle** with `book_value = 50000` → executive `fleet_value_mad` = **50000** (book value wins over `purchase_price`).
  - GPS **top_speeding** returns non-empty **brand/model** from joins when `vehicles.brand_name` / `model_name` are null.

Run:

```bash
cd backend && php artisan test --filter=DashboardControllerTest
```

## Files touched

- `backend/app/Http/Controllers/Api/V1/DashboardController.php` — full KPI/query alignment.
- `backend/tests/Feature/DashboardControllerTest.php` — new.
- `DASHBOARD_SQL_FIX_REPORT.md` — this report.

## Acceptance checklist

| Criterion | Status |
|-----------|--------|
| No dashboard query references missing columns | ✅ Verified against migrations + green tests |
| All dashboard endpoints return 200 | ✅ Feature test hits all five |
| KPIs use real financial / fleet / GPS schema | ✅ See formulas above |
| Tests pass | ✅ `DashboardControllerTest` |
| Frontend can trust backend numbers | ✅ `invoiced.paid` key preserved; added `invoice_amount_paid_field` for transparency |

---

*If new migrations rename columns again, update `issuedInvoiceStatuses()` and this report together.*
