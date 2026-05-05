# DriveFlow — Database integrity and migration hardening

**Date:** 2026-05-03  
**Scope:** Laravel migrations, Eloquent models, critical API surface, clean install without `driveflow_db.sql`.

## Executive summary

A migration-only database build was failing because `entity_attachments` referenced a non-existent `files` table. That gap is closed with an explicit `files` migration ordered before the document-center migration. Used-car (VO) tables were aligned with UUID primary keys on `vehicles`. Composite uniqueness was applied for invoice and contract numbers per company. An additive migration adds further foreign keys (VO ↔ finance ↔ signatures), performance indexes on `created_at` for hot tables, and SQLite-aware idempotency for foreign key checks.

**Verification:** `php artisan migrate:fresh --seed` completed successfully on the project MySQL database; `php artisan test` — 31 tests passed.

## 1. Clean build from migrations only

| Item | Status |
|------|--------|
| `driveflow_db.sql` | Legacy reference only; not required for `migrate:fresh` |
| `2026_05_01_155000_create_files_table` | Creates `files` before `2026_05_01_160000_extend_entity_attachments_document_center` |
| Document center FK | `entity_attachments.file_id` → `files.id` (cascade on delete) |

## 2. UUID / BIGINT consistency

| Area | Change |
|------|--------|
| `used_car_listings`, `used_car_sales`, `vehicle_ownership_transfers` | `vehicle_id` is `uuid` and matches `vehicles.id` (`2026_04_23_160000_create_phase9_used_cars_tables`) |
| New FKs | Added only where column types match referenced PKs (see migration `2026_05_03_220000_database_integrity_additional_foreign_keys`) |

## 3. Foreign keys added or reinforced

Migration `2026_05_03_220000_database_integrity_additional_foreign_keys` (idempotent; MySQL + SQLite):

- `used_car_listings`: `vehicle_id` → `vehicles`, `company_id` → `companies`, `branch_id` → `branches`
- `used_car_valuations`: `listing_id` → `used_car_listings`
- `used_car_sales`: `listing_id`, `vehicle_id`, `buyer_customer_id`, `invoice_id`, `contract_id`
- `vehicle_ownership_transfers`: `vehicle_id`, `sale_id`, `to_customer_id`
- `invoices`: `sale_id` → `used_car_sales`
- `payment_allocations`: `contract_installment_id` → `contract_installments`
- `signature_events`: `signer_id` → `signature_signers` (when column exists)

**Already covered** in `2026_04_30_210000_add_critical_foreign_keys_and_indexes` (not duplicated): core `contracts`, `invoices`, `payments`, `payment_allocations.payment_id` / `invoice_id`, reservations, missions, GPS, etc.

## 4. Indexes (status, due_date, tenancy keys)

`2026_04_30_210000_add_critical_foreign_keys_and_indexes` already defines composite indexes including `invoices` (`status`, `due_date`), `contracts.status`, `payments` (`status`, `payment_date`), and tenant-related FK columns where applicable.

`2026_05_03_220000` adds single-column **`created_at`** indexes on: `vehicles`, `customers`, `invoices`, `payments`, `contracts`, `used_car_listings`, and `entity_attachments` (when present) to support reporting and chronological queries.

## 5. Unique constraints

| Constraint | Implementation |
|------------|----------------|
| `invoice_number` per company | `unique(['company_id', 'invoice_number'], 'invoices_company_invoice_number_unique')` on `invoices` |
| `contract_number` per company | `unique(['company_id', 'contract_number'], 'contracts_company_contract_number_unique')` on `contracts` |
| `vehicles.registration_number` | Global `unique()` on column (existing migration) |
| `used_car_listings.listing_code` | Global `unique()` on `listing_code` (existing) |

**Note:** Composite uniques with nullable `company_id` allow multiple rows with `company_id = NULL` and the same number in MySQL/SQLite. If the product forbids that, enforce `company_id` as NOT NULL on those rows or use a partial/filtered unique strategy appropriate to the DB.

**Optional hardening:** If listing codes must be unique per tenant only, consider `unique(['company_id', 'listing_code'])` instead of global `listing_code` unique (requires data cleanup if duplicates exist).

## 6. Eloquent models vs tables

The codebase has more Eloquent model classes than base `create_*` migrations (helpers, pivots, enums-as-classes, or tables created inside larger phase migrations). The authoritative check is: **schema builds cleanly** and **automated tests** exercise the main domains (dashboard, fleet, maintenance, KYC, tenant security, used-car sell/invoice).

No migration was found that creates a table name referenced by a model that remained missing after this pass; the critical gap was **`files`** for `App\Models\File` and `EntityAttachment`.

## 7. Commands run

```bash
php artisan migrate:fresh --seed --force
php artisan test
```

## 8. Follow-up recommendations

1. **Invoice numbering:** `invoice_number` is unique per `company_id`; generation logic should remain company-scoped to avoid human confusion when numbers collide across companies.
2. **SQL dump:** Keep `driveflow_db.sql` only for legacy imports or disaster recovery; treat migrations as the source of truth for structure.
3. **Broader audit:** A one-off artisan command or static analysis script could diff `app/Models/*` `$table` properties against `Schema::getTableListing()` for ongoing drift detection (not implemented in this pass).

---

*End of report.*
