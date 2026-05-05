# DATABASE_SCHEMA_HARDENING_REPORT

## Scope analyzed

- `backend/database/migrations`
- `backend/driveflow_db.sql`
- `backend/app/Models`
- `backend/app/Http/Controllers/Api/V1`
- `backend/routes/api.php`

## Tables checked

- Core business: `contracts`, `contract_installments`, `credit_applications`, `credit_application_decisions`, `contract_histories`, `reservations`, `missions`, `mission_checklist_items`
- Fleet/GPS: `vehicles`, `vehicle_brands`, `vehicle_models`, `gps_devices`, `gps_positions`, `gps_alerts`, `geofences`, `trips`, `vehicle_geofence_states`
- Finance: `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `bank_accounts`, `bank_transactions`
- Signature: `signature_envelopes`, `signature_signers`, `signature_events`, `signature_providers`
- Auditing/notifications/documents: `audit_logs`, `app_notifications`, `notification_templates`, `generated_documents`

## Drift findings

### 1) Missing create-table migrations (critical)

The following model-backed tables were used by code but lacked `Schema::create(...)` migrations:

- `credit_applications`
- `contracts`
- `contract_installments`
- `geofences`
- `gps_devices`
- `gps_positions`
- `gps_alerts`
- `reservations`
- `missions`
- `mission_checklist_items`
- `audit_logs`

### 2) Table naming drift between SQL dump and Laravel schema

- `notifications` (SQL dump) vs `app_notifications` (Laravel model/migration)
- `gps_trips` (SQL dump) vs `trips` (Laravel model/migration)
- `used_car_evaluations` (SQL dump) vs `used_car_valuations` (Laravel model/migration)
- `credit_decisions` (SQL dump) vs `credit_application_decisions` (Laravel model/migration)
- `contract_status_history` (SQL dump) vs `contract_histories` (Laravel model/migration)

These SQL-dump names are treated as legacy/obsolete in current Laravel runtime.

### 3) UUID vs integer inconsistencies (critical)

- `vehicles` migration was bigint PK, while many dependent tables used UUID `vehicle_id`.
- `vehicle_brands` / `vehicle_models` were bigint PKs while fleet domain is UUID-centric.
- `permissions` migration columns did not match model/seeder expectations (`module_name`, `action_name`).

### 4) FK coverage drift

Many tables had indexed relationship columns but lacked enforced foreign keys for critical IDs (`company_id`, `branch_id`, `customer_id`, `vehicle_id`, `contract_id`, `invoice_id`, `payment_id`, `mission_id`).

### 5) Duplicate/overlapping evolution migrations

- Some additive vehicle migrations (`add_compliance_fields`, `add_photo`) re-added columns already present in base vehicle schema, causing duplicate-column failures on fresh databases.

## Migrations added

1. `backend/database/migrations/2026_04_23_125000_create_phase5_8_core_operations_tables.php`
   - Added missing create-table migrations for core operations/GPS/missions/reservations/contracts/credit domains.
   - Added baseline indexes and uniqueness constraints for high-frequency filters and identifiers.

2. `backend/database/migrations/2026_04_28_090000_create_audit_logs_table.php`
   - Added missing `audit_logs` create-table migration before subsequent audit alteration migrations.
   - Uses UUID primary key to align with model and later UUID migration.

3. `backend/database/migrations/2026_04_30_210000_add_critical_foreign_keys_and_indexes.php`
   - Added critical FK constraints safely (guarded checks) for key domains.
   - Added common status/date composite indexes for operational query paths.

## Existing migrations corrected

- `2026_04_23_120000_create_vehicle_brands_table.php`
  - PK changed to UUID.
- `2026_04_23_120010_create_vehicle_models_table.php`
  - PK/FK switched to UUID-compatible definition.
- `2026_04_23_120020_create_vehicles_table.php`
  - PK switched to UUID and fleet columns aligned to model/controller expectations.
- `2026_04_23_100000_create_phase2_rbac_tables.php`
  - `permissions` table aligned to `Permission` model and `RbacSeeder` (`module_name`, `action_name`).
- `2026_04_26_130220_add_compliance_fields_to_vehicles_table.php`
  - Added idempotent `hasTable`/`hasColumn` guards.
- `2026_04_27_100000_add_photo_to_vehicles_table.php`
  - Added idempotent guard for `photo_file_id`.

## Models corrected

- `backend/app/Models/VehicleBrand.php`
  - Set UUID model identity (`$incrementing = false`, `$keyType = 'string'`).
- `backend/app/Models/VehicleModel.php`
  - Set UUID model identity and corrected fillable from `model_name` to `name` to match schema.

## Critical FKs added (requested domains)

- `company_id`: enforced in `contracts`, `credit_applications`, `reservations`, `missions`, `gps_devices`, `invoices`, `payments`
- `branch_id`: enforced in `contracts`, `credit_applications`, `reservations`, `missions`, `invoices`, `payments`
- `customer_id`: enforced in `contracts`, `credit_applications`, `reservations`, `invoices`, `payments`
- `vehicle_id`: enforced in `contracts`, `credit_applications`, `reservations`, `missions`, `gps_positions`, `gps_alerts`
- `contract_id`: enforced in `contract_installments`, `missions`, `invoices`
- `invoice_id`: enforced in `payment_allocations`
- `payment_id`: enforced in `payment_allocations`
- `mission_id`: enforced in `mission_checklist_items`
- `signature_envelope_id`: no direct column named `signature_envelope_id` exists; signature domain uses `envelope_id` and remains FK-constrained to `signature_envelopes`

## Indexes added for common filters/statuses

- `contracts(status)`
- `contract_installments(installment_status, due_date)`
- `credit_applications(decision_status, scoring_status)`
- `reservations(status, desired_start_at)`
- `missions(status, scheduled_start_at)`
- `invoices(status, due_date)`
- `payments(status, payment_date)`
- `app_notifications(status, scheduled_at)`
- `signature_envelopes(status, sent_at)`
- `signature_signers(envelope_id, status)`
- `signature_events(envelope_id, occurred_at)`

## Commands executed

- `php artisan migrate:fresh --seed` (multiple iterations)
  - Initial failures surfaced true schema drift (FK type mismatch and duplicate columns).
  - After fixes, command completed successfully.

## Migration result

- Final status: `php artisan migrate:fresh --seed` **PASS**
- Database can now be created from migrations + seeders, without depending on `driveflow_db.sql`.

## Follow-up applied (UUID normalization)

- Normalized UUID-like `string(36)` columns to native `uuid(...)` declarations in:
  - `2026_04_24_080000_create_phase11_accounting_tables.php`
  - `2026_04_24_090000_create_phase12_arrears_tables.php`
  - `2026_04_30_190000_create_accounting_settings_table.php`
- Re-ran `php artisan migrate:fresh --seed` after normalization: **PASS**

## Remaining risks

- Legacy `driveflow_db.sql` still contains historical/renamed table variants and may confuse manual comparisons.
- Some older domains still use mixed conventions (`string(36)` vs `uuid`) even where values are UUIDs; functionally valid but stylistically inconsistent.
- Existing production databases may contain historical constraints/index names that differ from local hardening assumptions; migration is guarded for fresh/local and should be validated on staging with a production clone.

