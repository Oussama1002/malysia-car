# Task 4 — Audit & Traçabilité (DB-persisted)

Replaces the previous `Log::info`-based audit trail with a fully persisted
`audit_logs` pipeline, exposed through three REST endpoints, gated by RBAC,
and surfaced in the React app (global page + per-entity timeline + CSV export).

---

## 1. Schema changes

Three migrations applied (in order):

| File | Purpose |
| --- | --- |
| `2026_04_28_140000_add_action_label_to_audit_logs.php` | Adds `action_label varchar(191) NULL` after `action_type` for human-readable labels. |
| `2026_04_28_140100_relax_audit_logs_entity_columns.php` | Makes `entity_type` and `entity_id` nullable so system events (login/logout/scheduled jobs/exports) without an Eloquent subject can be persisted. |
| `2026_04_28_140200_audit_logs_uuid_id.php` | Converts `id` from `bigint unsigned auto_increment` to `char(36)` to match the model's `HasUuids` trait (UUID v7 from `Str::orderedUuid()`). |

Final `audit_logs` shape:

```
id                  char(36) PK
company_id          char(36) NOT NULL
branch_id           char(36) NULL
user_id             char(36) NULL
entity_type         varchar(191) NULL    ← was NOT NULL
entity_id           varchar(191) NULL    ← was NOT NULL
action_type         varchar(50)  NOT NULL
action_label        varchar(191) NULL    ← new
module_name         varchar(80)  NOT NULL
ip_address          varchar(64)  NULL
user_agent          text         NULL
before_data         longtext     NULL    (JSON cast on model)
after_data          longtext     NULL    (JSON cast on model)
legal_significance  tinyint(1)   NOT NULL
created_at          timestamp    NOT NULL
```

Smoke test confirmed: `App\Services\AuditLogger::record(action:'test_login', …)`
inserts a row with UUID id `019dd5f4-91e5-7087-af80-c4938860cbea`.

---

## 2. AuditLogger helper API (`app/Services/AuditLogger.php`)

Single entry-point service with intent-revealing helpers — all swallow
exceptions internally and log a `local.WARNING audit_log.write_failed` so
business actions never break.

```php
AuditLogger::created($model, label: 'Customer created');
AuditLogger::updated($model, before: $snapshot, label: 'Customer updated');
AuditLogger::deleted($model, label: 'Customer deleted');
AuditLogger::statusChanged($model, from: 'draft', to: 'active', label: 'Activated');
AuditLogger::financialAction($model, action: 'invoice_issued', label: 'Facture émise');   // legal=true
AuditLogger::legalAction($model, action: 'case_opened', label: 'Dossier ouvert');         // legal=true
AuditLogger::record(action: 'login', user: $u, module: 'auth', label: '…');               // no Eloquent subject
AuditLogger::log(...);                                                                     // backwards-compat shim
```

Internals:

- `before` / `after` auto-derived from `getOriginal()` / `getChanges()` if the
  caller passes the model and omits the snapshots.
- Sensitive keys (`password`, `password_hash`, `remember_token`, `api_token`,
  `secret`) stripped before persistence.
- `company_id` taken from the actor or model; `branch_id` from the model when
  available.
- `ip_address` / `user_agent` resolved via `app('request')` with try/catch —
  works in HTTP, CLI, queue contexts.
- `module_name` derived from class basename (`Contract` → `contracts`,
  `LegalCase` → `legal`, …) when caller doesn't override.

---

## 3. Controllers wired (16 files, 47 calls)

| Controller | Calls | Notable actions |
| --- | --- | --- |
| `AuthController` | 4 | login / login_failed / logout |
| `CustomerController` | 3 | created / updated / deleted |
| `KycController` | 5 | document_uploaded / verified / deleted / approved / rejected |
| `VehicleController` | 3 | created / updated / deleted |
| `VehicleAccidentController` | 3 | created / updated / deleted |
| `VehicleRepairController` | 2 | created / updated |
| `VehicleMaintenanceEventController` | 1 | created |
| `ContractController` | 5 | created / updated / approve / activate / terminate (legal) |
| `CreditApplicationController` | 4 | created / updated / scored / decision (legal) |
| `InvoiceController` | 5 | created / updated / issued (financial) / cancelled (financial) / deleted |
| `PaymentController` | 2 | created (financial) / allocated (financial) |
| `AccountingEntryController` | 3 | created / posted (financial) / cancelled (financial) |
| `LegalCaseController` | 4 | created / updated / escalated / closed (legal) |
| `ArrearsCaseController` | 3 | created / updated / closed (legal) |
| `SignatureEnvelopeController` | 4 | sent / voided / signed (legal) / declined |
| `GeneratedDocumentController` | 2 | pdf_generated for contracts / invoices |

`legal_significance = true` for every financial / legal helper call —
ensures these rows surface under the **Significatif juridiquement** filter
and the amber badge in both the audit table and entity timelines.

**Not yet instrumented** (intentional follow-ups):
- `CustomerSubresourceController::blacklist()` / `unblacklist()` (lives outside the main `CustomerController`).
- `SignatureWebhookController` (third-party callback path; out of Task 4 scope).

---

## 4. Endpoints + RBAC

`routes/api.php` — under the sanctum-protected group:

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/audit` | `audit.view` |
| `GET` | `/api/v1/audit/{id}` | `audit.view` |
| `GET` | `/api/v1/audit/export.csv` | `audit.export` |
| `GET` | `/api/v1/entities/{entityType}/{entityId}/audit` | `audit.view` |

Legacy `/api/v1/audit-logs` kept as alias for any client still using the
previous URL.

`config/erp.php` permission map:

```php
'audit.view'   => ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'CONTENTIEUX'],
'audit.export' => ['ADMIN', 'DIRECTEUR'],
```

`RbacSeeder.php` declares the new `audit.export` permission so
`db:seed --class=RbacSeeder` provisions it on existing installs.

### Filters supported by `index` and `forEntity`

`module`, `action`, `user_id`, `entity_type` (alias or FQCN), `entity_id`,
`from`, `to`, `legal_only`, `q` (LIKE on `action_label` / `action_type`),
`per_page`, `page`.

### Entity-type aliases

`contract`, `customer`, `vehicle`, `invoice`, `payment`, `kyc` (resolves
to both `CustomerKycCase` and `CustomerKycDocument`), `credit_application`,
`legal_case`, `arrears_case`, `envelope`, `accounting_entry`, `document`.

### CSV export

UTF-8 BOM + chunked stream (500 rows / batch) via `streamDownload`. Header
columns: `id, occurred_at, module, action, action_label, entity_type,
entity_id, user_id, actor_email, ip_address, legal_significance`.

---

## 5. Frontend deliverables

### `modules/audit/AuditPage.tsx`
Full rewrite — no more mocks. Reads `auditApi.list(filters)` and renders:

- 8 filter controls in a 4-col responsive grid (module dropdown, action input,
  entity-type dropdown, entity-id input, user-id input, from/to date pickers,
  legal-only checkbox).
- DataTable: module · action_label + raw action · entity (FQCN basename + first
  8 chars of UUID) · actor · legal badge · IP · date · **Diff →** button.
- Slide-out `DiffDrawer` showing pretty-printed `before_data` / `after_data`
  side-by-side.
- **Exporter CSV** button in the header — fetches with the bearer token from
  `localStorage.df_session`, blob → anchor download.

### `modules/shared/components/EntityAuditTimeline.tsx` (new)
Drop-in for any detail page:

```tsx
<EntityAuditTimeline entityType="contract" entityId={contractId} />
```

Renders a vertical timeline (amber dot for legal entries, indigo otherwise),
each row showing the action label, actor, IP, and an expandable diff.

### `modules/contracts/ContractDetailPage.tsx`
History tab now shows the new audit timeline above the existing business
timeline. Same pattern can be dropped into customer / invoice / vehicle /
credit / legal detail pages identically.

### `services/auditApi.ts` + `services/endpoints.ts`
- Typed `AuditLogDto` with full server shape (`action_label`, `before_data`,
  `after_data`, `legal_significance`, `company_id`, `branch_id`, …).
- `auditApi.list / get / forEntity / exportCsv`.
- `endpoints.audit` is now an object: `{ list, one(id), forEntity(t,i), exportCsv }`.

---

## 6. Deploy steps

```bash
# 1. apply schema changes
php artisan migrate --force

# 2. provision the new audit.export permission
php artisan db:seed --class=RbacSeeder

# 3. cache config (optional, prod)
php artisan config:cache && php artisan route:cache
```

No env vars required.

---

## 7. Acceptance — checklist

- [x] Each critical action creates an `audit_logs` row (47 instrumentation
      points across 16 controllers; smoke-tested with `record('test_login')`).
- [x] `AuditPage` no longer uses any mock; reads `/api/v1/audit` with filters.
- [x] Per-entity history visible (`EntityAuditTimeline` mounted in
      `ContractDetailPage` history tab; reusable on any other detail page).
- [x] `before` / `after` snapshots present for `updated()` calls (auto-derived
      from `getOriginal()` / `getChanges()` when the caller doesn't pass them).
- [x] Financial + legal actions flagged `legal_significance = true` (helpers
      `financialAction()` / `legalAction()` set the flag automatically).
- [x] CSV export wired (backend stream + frontend bearer-auth blob download).
- [x] RBAC enforced (`audit.view` for ADMIN/DIRECTEUR/COMPTABLE/CONTENTIEUX,
      `audit.export` for ADMIN/DIRECTEUR).

---

## 8. Known follow-ups

1. Wire `CustomerSubresourceController::blacklist()` / `unblacklist()` —
   should call `AuditLogger::legalAction()`.
2. Wire `SignatureWebhookController` — record the inbound provider events.
3. Drop `<EntityAuditTimeline />` into the remaining detail pages
   (`CustomerDetailPage`, `InvoiceDetailPage`, `VehicleDetailPage`,
   `CreditApplicationDetailPage`, `LegalCaseDetailPage`).
4. (Ops) The XAMPP-served API at `/driveflow/backend/public` still runs
   PHP 8.2 and now fails composer's `platform_check` — switch the vhost to
   Herd's PHP 8.4 or upgrade XAMPP. Out of Task 4 scope.
