# Softnovation Document Reader

OCR-driven ingestion of client and vehicle documents. The MVP ships with the
free **Tesseract** engine. A provider interface (`OcrProviderInterface`) lets
us plug **Google Document AI** or **Azure Document Intelligence** later without
touching controllers or the frontend.

## Workflow

1. Admin uploads (drag & drop / file picker / camera) a PDF, JPG, JPEG or PNG.
2. Backend stores the original file via the existing central `files` table and
   creates a row in `reader_documents` (status `pending`).
3. The admin (or the auto-trigger right after upload) calls **extract** — OCR
   runs, the parser detects the document type and pulls the required fields.
   Result lands on `reader_document_extractions.extracted_data` (status
   `draft`). The document moves to `extracted`.
4. The admin reviews / edits the fields in the UI.
5. The admin clicks **Valider et enregistrer** — fields are persisted as
   `validated_data` (status `validated`). Linking to a customer, driver,
   vehicle, reservation or contract is an explicit option in the same call.
6. **Nothing is ever auto-saved on a business entity.** Only `validated_data`
   is considered authoritative.

## Supported document types & extracted fields

| Type                     | Fields                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `cin` / `passport`       | first_name, last_name, full_name, document_number, document_type, date_of_birth, nationality, address, issue_date, expiry_date |
| `driving_license`        | license_number, full_name, date_of_birth, categories, issue_date, expiry_date              |
| `vehicle_registration`   | registration_number, vin_number, brand, model, fuel_type, first_registration_date, owner_name |
| `rental_contract`/`other`| free-form upload (no schema)                                                                |

## REST API (`/api/v1/document-reader/*`)

| Method | Path                                       | Purpose                                | Permission              |
| ------ | ------------------------------------------ | -------------------------------------- | ----------------------- |
| GET    | `/documents`                               | List paginated documents               | `documents.view`        |
| GET    | `/documents/{id}`                          | Show + latest extraction               | `documents.view`        |
| POST   | `/uploads`                                 | Upload original file                   | `documents.upload`      |
| POST   | `/documents/{id}/extract`                  | Run OCR + parser                       | `documents.upload`      |
| POST   | `/documents/{id}/validate`                 | Persist admin-corrected fields         | `documents.upload` + role ADMIN/DIRECTEUR/AGENT_COMMERCIAL |
| POST   | `/documents/{id}/link`                     | Attach to customer/vehicle/etc.        | `documents.upload` + role ADMIN/DIRECTEUR/AGENT_COMMERCIAL |
| GET    | `/documents/{id}/preview`                  | Inline stream of original file         | `documents.view`        |
| DELETE | `/documents/{id}`                          | Delete document + extractions          | `documents.delete`      |

All requests require `Authorization: Bearer <sanctum-token>` and are tenant-scoped.
Validation accepts only `pdf, jpg, jpeg, png` up to **15 MB** (override with
`DOC_READER_MAX_KB`). Every action is recorded by the existing `AuditLogger`
under the `document_reader` module.

## Database

Two new tables — see migration
`2026_05_20_100000_create_document_reader_tables.php`.

* `reader_documents` — original-file metadata, document type, status, link to a
  business entity.
* `reader_document_extractions` — `raw_text`, `extracted_data` (auto), then
  `validated_data` (admin-confirmed). One row per extraction attempt; the
  latest is used by the UI.

## Installing the OCR dependencies

Tesseract is a regular system binary. The MVP shells out to it, so no PHP
extension is required.

### Linux (Debian / Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng \
                        tesseract-ocr-ara poppler-utils
```

### macOS (Homebrew)

```bash
brew install tesseract tesseract-lang poppler
```

### Windows

1. Tesseract — install the official build from <https://github.com/UB-Mannheim/tesseract/wiki>
   (defaults to `C:\Program Files\Tesseract-OCR\tesseract.exe`).
2. Poppler — download a Windows build (e.g. <https://github.com/oschwartz10612/poppler-windows/releases>)
   and put `pdftoppm.exe` on the PATH (or pin it via `PDFTOPPM_BIN`).
3. Add both directories to the system `PATH`, or set absolute paths in `.env`:

```dotenv
TESSERACT_BIN="C:\Program Files\Tesseract-OCR\tesseract.exe"
PDFTOPPM_BIN="C:\poppler\Library\bin\pdftoppm.exe"
TESSERACT_LANG=eng+fra+ara
TESSERACT_TIMEOUT=120
```

### Verification

```bash
tesseract --version
pdftoppm -v
```

If either binary is missing the controller returns `422` with a human-readable
hint ("Le binaire 'tesseract' est introuvable…"); no document data is lost.

## Adding a paid provider later

1. Implement `App\Services\DocumentReader\OcrProviderInterface` (e.g.
   `GoogleDocumentAiProvider`).
2. In `AppServiceProvider::register()` swap the singleton based on
   `config('document_reader.provider')`.
3. No controller, route or frontend change needed — only the OCR backend changes.

## Frontend

Page: `/documents/reader` (module `documents`, sidebar group **Système**).
Component: `frontend/modules/documents/DocumentReaderPage.tsx`.
API client: `frontend/services/documentReaderApi.ts`.

UI capabilities:

* Drag & drop upload + file picker + native camera capture (mobile).
* Document type hint dropdown.
* Live status (pending → processing → extracted → validated / failed).
* Inline preview (`<iframe>` for PDF, `<img>` otherwise).
* Raw OCR text viewer.
* Editable schema-driven field grid (5 templates).
* "Valider et enregistrer" / "Réessayer l'extraction" / link to
  customer · driver · vehicle · reservation · contract.
* Error states for blurry / unsupported documents (server message surfaced).

## Security checklist

* Tenant-scoped (`tenant.scope` middleware) — never cross-company.
* `auth:sanctum` + `permission:documents.*` on every route.
* Validation step gated to `ADMIN, DIRECTEUR, AGENT_COMMERCIAL`.
* Files stored on the configured filesystem disk (private by default).
* Streaming download/preview goes through the controller, never via a public URL.
* `mimes:pdf,jpg,jpeg,png` + 15 MB size cap enforced server-side.
* Every upload / extract / validate / link / delete is recorded in `audit_logs`.
