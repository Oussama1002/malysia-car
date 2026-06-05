# Document Reader — Production Deployment Runbook

Steps to roll the Softnovation Document Reader feature to the existing
DriveFlow server (`/var/www/driveflow`, Linux, PHP-FPM, MySQL).

## 0. Prerequisites (one-time, on the server)

SSH in as a sudoer and install the OCR binaries. They are free and ship in
Debian/Ubuntu repos.

```bash
sudo apt update
sudo apt install -y \
    tesseract-ocr \
    tesseract-ocr-fra \
    tesseract-ocr-ara \
    tesseract-ocr-eng \
    poppler-utils

# Sanity check — must print version numbers, no errors:
tesseract --version
tesseract --list-langs   # must include eng, fra, ara
pdftoppm -v
```

If you run PHP-FPM in a chroot or containerised env, make sure the
`www-data` user can `exec()` both binaries:

```bash
sudo -u www-data tesseract --version
```

## 1. Update `backend/.env` on the server

Append (or merge — values are safe defaults):

```dotenv
DOC_READER_PROVIDER=tesseract
TESSERACT_BIN=tesseract
PDFTOPPM_BIN=pdftoppm
TESSERACT_LANG=eng+fra+ara
TESSERACT_TIMEOUT=120
DOC_READER_MAX_KB=15360
```

If you installed Tesseract somewhere non-standard, set `TESSERACT_BIN` and
`PDFTOPPM_BIN` to the absolute paths returned by `which tesseract` /
`which pdftoppm`.

## 2. Confirm storage disk + upload limits

The module stores originals on the disk pointed to by `FILESYSTEM_DISK`
(`local` by default, i.e. `backend/storage/app/...`). Make sure that path
is writable by `www-data` and **not** served by Nginx/Apache:

```bash
ls -ld /var/www/driveflow/backend/storage/app
sudo -u www-data touch /var/www/driveflow/backend/storage/app/.docreader_probe && \
    rm /var/www/driveflow/backend/storage/app/.docreader_probe
```

Nginx upload limit must allow 15 MB (matches `DOC_READER_MAX_KB`):

```nginx
client_max_body_size 16M;
```

PHP-FPM (`/etc/php/8.2/fpm/php.ini`):

```ini
upload_max_filesize = 16M
post_max_size = 20M
```

Reload after any change: `sudo systemctl reload nginx php8.2-fpm`.

## 3. Tag & push

From your local machine:

```bash
git add -A
git commit -m "Document Reader OCR module"
git tag v1.x.0-document-reader
git push origin main --tags
```

## 4. Run the standard deploy flow

```bash
ssh deploy@your-server
cd /var/www/driveflow

# Pre-flight — must end with FAIL=0
bash deploy/pre-deploy-checklist.sh https://api.driveflow.yourdomain.com/api/v1

# Deploy
sudo -u www-data bash deploy/deploy.sh v1.x.0-document-reader
```

`deploy.sh` already runs `php artisan migrate --force`, which picks up
`2026_05_20_100000_create_document_reader_tables.php` and creates:

* `reader_documents`
* `reader_document_extractions`

It also rebuilds the frontend (`npm run build`) which bundles the new
`/documents/reader` page and the OCR scanner on the customer form.

## 5. Smoke test

```bash
# Token from a quick login
TOKEN=$(curl -s -X POST https://api.driveflow.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@co.ma","password":"xxx"}' | jq -r .data.token)

# List endpoint should return 200 with an empty list initially
curl -s https://api.driveflow.yourdomain.com/api/v1/document-reader/documents \
  -H "Authorization: Bearer $TOKEN" | jq .

# Upload a small JPG (CIN scan) and check the response
curl -s -X POST https://api.driveflow.yourdomain.com/api/v1/document-reader/uploads \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@/tmp/cin-sample.jpg -F document_type=cin | jq .
```

Then in the browser:

1. Open https://app.driveflow.yourdomain.com/documents/reader
2. Drop a CIN/passport — status should go `pending → processing → extracted`.
3. Open /customers → "Nouveau client" → Particulier — the OCR scanner appears
   above the identity fields. Dropping a CIN must pre-fill name, CIN,
   birth date and nationality.

## 6. Rollback

If something is wrong the deploy script already saved the prior dist and a
DB dump in `/var/backups/driveflow`. Use the existing rollback script:

```bash
sudo -u www-data bash deploy/rollback.sh
```

The two new tables are additive — leaving them in place during a rollback
is safe (older code simply ignores them). If you really need to undo
the schema:

```bash
cd /var/www/driveflow/backend
php artisan migrate:rollback --path=database/migrations/2026_05_20_100000_create_document_reader_tables.php
```

## 7. Switching to a paid provider later

When you want Google Document AI or Azure Document Intelligence:

1. Implement `App\Services\DocumentReader\OcrProviderInterface` (e.g.
   `GoogleDocumentAiProvider`).
2. In `AppServiceProvider::register()` switch on
   `config('document_reader.provider')` to bind the new implementation.
3. Set `DOC_READER_PROVIDER=google_document_ai` in `.env` plus the
   provider credentials.
4. Re-deploy via the standard `deploy.sh`. No DB or frontend changes
   needed — the contract is provider-agnostic.

## Troubleshooting

| Symptom in UI                                              | Likely cause                  | Fix                                                                      |
| ---------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| "Le binaire 'tesseract' est introuvable…"                  | Binary missing or not on PATH | `apt install tesseract-ocr` ; set `TESSERACT_BIN=/usr/bin/tesseract`     |
| "Le binaire 'pdftoppm' (poppler-utils) est requis…"        | Poppler missing               | `apt install poppler-utils`                                              |
| 413 / 422 on upload                                        | Nginx/PHP body size too low   | Bump `client_max_body_size` and `upload_max_filesize` (see §2)           |
| `status = failed` after extract                            | Image too blurry / wrong lang | Re-scan at 300 DPI; confirm `tesseract-ocr-ara/fra` packs installed      |
| Page `/documents/reader` shows 404                         | Frontend not rebuilt          | Re-run `npm run build` then reload Nginx                                 |
| 403 on `POST /document-reader/documents/{id}/validate`     | Role gate                     | Validation needs ADMIN / DIRECTEUR / AGENT_COMMERCIAL                    |
