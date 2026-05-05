# PDF Generation System — Phase 3 Report

**Date:** 2026-04-28
**Scope:** Add a server-side PDF generation pipeline (Blade → DomPDF → disk storage with SHA256 checksum) plus a `generated_documents` ledger and "Générer PDF" buttons on contract and invoice detail screens.

---

## 1. Stack

- **Library:** `barryvdh/laravel-dompdf` (installed via composer with PHP 8.4 — composer aborts on the local 8.2 binary because Laravel 13 requires `>= 8.3`).
- **Storage:** Default filesystem disk (`local`). The disk is recorded per document so future S3 migration only needs a config flip.
- **Integrity:** SHA256 of the rendered binary is stored in `generated_documents.sha256` and echoed on download via the `X-Document-Sha256` response header.

---

## 2. Backend additions

| File                                                                                          | Purpose                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `database/migrations/2026_04_28_120000_create_generated_documents_table.php`                  | UUID PK, scoped by company, polymorphic `entity_type` + `entity_id`, SHA256, metadata (json), indexes for `(entity_type,entity_id)` and `(company_id,document_type)`. |
| `app/Models/GeneratedDocument.php`                                                            | `HasUuids`, casts `metadata` to array.                                   |
| `app/Services/PdfService.php`                                                                 | Renders a Blade view, hashes the binary, stores it on the configured disk, persists a `GeneratedDocument` row. |
| `app/Http/Controllers/Api/V1/GeneratedDocumentController.php`                                 | `index`, `show`, `download`, `generateContract`, `generateInvoice`.      |
| `resources/views/pdf/layout.blade.php`                                                        | Shared header/footer + print stylesheet (DejaVu Sans for full latin coverage). |
| `resources/views/pdf/contract.blade.php`                                                      | Parties, vehicle, financial conditions, signature block.                 |
| `resources/views/pdf/invoice.blade.php`                                                       | Issuer/recipient, line items, totals, payment terms.                     |

### Routes (under `/api/v1`, sanctum-authenticated)

| Method | Path                                | Permission           |
| ------ | ----------------------------------- | -------------------- |
| GET    | `/documents`                        | `documents.view`     |
| GET    | `/documents/{id}`                   | `documents.view`     |
| GET    | `/documents/{id}/download`          | `documents.view`     |
| POST   | `/contracts/{contract}/generate-pdf`| `documents.generate` |
| POST   | `/invoices/{invoice}/generate-pdf`  | `documents.generate` |

### RBAC

Two new permissions registered in `RbacSeeder` (module `documents`) and mirrored in the `config/erp.php` fallback:
- `documents.view` — ADMIN, DIRECTEUR, AGENT_LOCATION, COMPTABLE, ANALYSTE_CREDIT
- `documents.generate` — ADMIN, DIRECTEUR, AGENT_LOCATION, COMPTABLE

Both also added to the `$admin_full` and DIRECTEUR bundle arrays in the seeder.

---

## 3. Frontend additions

| File                                                       | Purpose                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `services/endpoints.ts`                                    | New `documents` namespace + `contracts.generatePdf(id)`.             |
| `services/documentsApi.ts`                                 | Typed `GeneratedDocumentDto` + `list`, `generateContractPdf`, `generateInvoicePdf`, `downloadUrl`. |
| `modules/shared/components/GeneratePdfButton.tsx`          | Reusable button: posts to the generate endpoint, opens download URL in a new tab, surfaces inline error. |
| `modules/contracts/ContractDetailPage.tsx`                 | "Générer PDF" button next to the amount card.                        |
| `modules/finance/InvoiceDetailPage.tsx`                    | "Générer PDF" button in the action toolbar.                          |

---

## 4. End-to-end flow

1. User clicks **Générer PDF** on a detail screen.
2. Front sends `POST /api/v1/{contracts|invoices}/{id}/generate-pdf`.
3. Controller resolves the entity (with eager-loaded relations), calls `PdfService::render(...)`.
4. Service renders the Blade view, calls `Pdf::output()`, hashes the binary (SHA256), writes it to `Storage::disk($disk)->put('documents/{type}/{ts}-{rand}.pdf', $bin)` and inserts a `generated_documents` row carrying the company scope, the actor, the polymorphic entity link, the SHA256, the mime type, the byte length and arbitrary metadata.
5. Response (`201`) returns the document. The frontend opens `GET /documents/{id}/download` in a new tab; the controller streams the binary back with `Content-Type`, `Content-Length`, and `X-Document-Sha256` headers so the recipient can verify integrity.

---

## 5. Acceptance verification

- `php artisan migrate` — `generated_documents` created cleanly.
- `php artisan route:list --path=documents` — all 5 routes registered with the right permission middleware.
- Vite preview — `documentsApi` and `GeneratePdfButton` import + compile cleanly (verified in browser via dynamic `import()`); `/contracts` list page renders without new errors. The pre-existing `/dashboard` duplicate-key warning and the `useAuthSession` error boundary trip are unrelated and predate this work.

> Detail-page rendering of the button itself was not exercised in the preview because the dev environment has no contracts/invoices seeded; both detail pages only mount once a record exists. The TypeScript types and import graph compile, so the button will appear as soon as a record is reachable.

---

## 6. Deploy steps

1. `composer install` (the lock file now pins `barryvdh/laravel-dompdf`). **Requires PHP ≥ 8.3.**
2. `php artisan migrate` — applies `generated_documents`.
3. `php artisan db:seed --class=RbacSeeder` — registers `documents.view` / `documents.generate` and attaches them to ADMIN + DIRECTEUR.
4. Ensure `storage/app` (or your S3 bucket) is writable by the web user.
5. Frontend: rebuild — no env changes required.

---

## 7. Known follow-ups (not in this phase)

- **Quote / KYC / accident-report templates:** the engine is generic (`PdfService::render($view, $data, $documentType, ...)`); add Blade views and controller methods when those modules need PDF output.
- **Async generation:** today the request renders synchronously. Heavy contracts (multi-page schedules) would benefit from a queued job + `documents.processing` status — out of scope for this phase.
- **Branding per company:** the layout uses static `DriveFlow` strings. A `companies.brand_*` column set + render data injection would let multi-tenant deployments swap the header/footer.
- **Signature integration:** `contracts/{id}/generate-pdf` currently emits an unsigned contract. Once Phase 13 (e-sign envelopes) is plumbed end-to-end, the controller should accept a `?variant=signed|unsigned` flag and merge the signature evidence page before persisting.
