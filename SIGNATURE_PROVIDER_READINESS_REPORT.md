# Signature provider readiness report (DriveFlow)

**Date:** 2026-05-03  
**Scope:** Electronic signature module — provider abstraction, security, webhooks, document lifecycle, UI, tests.

## Summary

The signature stack is **provider-switchable via environment**, **webhooks are HMAC-validated and idempotent**, **internal OTP is sandbox-only** (configurable list of Laravel environments, with an explicit production escape hatch), **OTP is never logged outside `local`/`testing`**, and **send requires a resolvable PDF** (`source_file_id` → `GeneratedDocument` on disk, or `document_path` on `SIGNATURE_DOCUMENT_DISK`). **Signed output** is tracked via `signed_file_id`, `certificate_file_id`, and `proof_metadata`, with `SignatureWorkflowService::completeEnvelope()` supporting either **provider-supplied file IDs** (webhook payload) or **internal copy-from-source** behaviour.

## Architecture

| Component | Role |
|-----------|------|
| `SignatureProviderInterface` | Contract: `key`, `sendEnvelope`, `verifyOtp`, `sign`, `mapWebhookEvent`. |
| `InternalOtpSignatureProvider` | OTP issuance, `provider_envelope_id` (`internal_{uuid}`), first signer `sent`. OTP **log only** when `APP_ENV` is `local` or `testing` **and** `SIGNATURE_INTERNAL_OTP_LOG=true`. |
| `ExternalSignatureProviderInterface` | Marker for third-party providers. |
| `AbstractExternalSignatureProvider` | Stub send: `provider_envelope_id`, all signers `sent` + `provider_signer_id`; webhook mapping; `verifyOtp` → `false`. |
| `YousignProviderStub`, `DocuSignProviderStub`, `ExternalSignatureProviderStub` | Concrete stubs keyed `yousign`, `docusign`, `adobe`. |
| `SignatureProviderManager` | Resolves provider; enforces internal allowed environments (`SIGNATURE_INTERNAL_ENVIRONMENTS`) unless `SIGNATURE_ALLOW_INTERNAL_OUTSIDE_DEV=true`. |

## Configuration (`config/signature.php`)

| Env variable | Purpose |
|--------------|---------|
| `SIGNATURE_PROVIDER` | `internal` \| `yousign` \| `docusign` \| `adobe` (default `yousign` in `.env.example`). |
| `SIGNATURE_INTERNAL_ENVIRONMENTS` | Comma list (default `local,testing,staging`) where `internal` is allowed without the escape hatch. |
| `SIGNATURE_ALLOW_INTERNAL_OUTSIDE_DEV` | When `true`, allows `internal` in any environment (explicit). |
| `SIGNATURE_INTERNAL_OTP_LOG` | When `true`, logs OTP **only** in `local`/`testing`. |
| `SIGNATURE_WEBHOOK_SECRET` | Global HMAC secret if per-provider secret is empty. |
| `SIGNATURE_CALLBACK_URL` | Callback URL registered with providers (stubs expose in metadata). |
| `SIGNATURE_DOCUMENT_DISK` | Disk used to validate `document_path` when no `source_file_id`. |
| `YOUSIGN_WEBHOOK_SECRET` / `DOCUSIGN_WEBHOOK_SECRET` / `ADOBE_SIGN_WEBHOOK_SECRET` | Per-provider HMAC (preferred over global). |

## HTTP surface

- **Authenticated:** `POST /api/v1/signatures/envelopes/{id}/send` — requires PDF source; creates provider reference and signer state via provider.  
- **Public webhook:** `POST /api/v1/signatures/webhooks/provider` — **outside** `auth:sanctum`. Headers: `X-Signature-Provider` (optional), `X-Signature-Hmac` or `X-Provider-Signature` (HMAC-SHA256 of raw body). Rejects `internal` with **400**. Invalid HMAC → **401**. Successful processing still returns `{ "received": true }` for provider compatibility; invalid HMAC does not.  
- **Internal provider:** no webhooks; `mapWebhookEvent` returns `null`.

## Webhook processing

1. Resolve provider key (header / body / default).  
2. Validate HMAC using per-provider secret, then `SIGNATURE_WEBHOOK_SECRET`. If no secret is configured, verification succeeds **only** in `local` and `testing` (not `staging`).  
3. Idempotency: `signature_events.idempotency_key` unique — duplicate deliveries no-op.  
4. Updates signer/envelope from mapped `signer_status` / `envelope_status`.  
5. `completed` → `SignatureWorkflowService::completeEnvelope()` with optional `signed_file_id`, `certificate_file_id`, `proof_metadata` from payload; idempotent if `signed_file_id` already set.  
6. `failed` / `envelope-failed` → internal `failed` event and envelope status `failed`.

## Audit trail

- Controller: `AuditLogger::legalAction` on send (`envelope_sent`), sign, decline, void.  
- Workflow: each `recordEnvelopeEvent` writes `AuditLogger::legalAction` with action `signature_{event_type}` (covers opened, otp, signed, declined, completed, failed, etc.).

## Data model (high level)

- `signature_envelopes`: `provider`, `provider_envelope_id`, `source_file_id`, `signed_file_id`, `certificate_file_id`, `proof_metadata`, status including **`failed`**.  
- `signature_signers`: `provider_signer_id`, status progression.  
- `signature_events`: `idempotency_key` (unique).  
- `generated_documents`: source PDF and derived signed PDF / certificate JSON.

## Frontend (`frontend/modules/signature`, `frontend/services/signatureApi.ts`)

- **Provider display:** `PROVIDER_LABEL` (human-readable).  
- **Signer progress:** list + bar + per-row status (existing, retained).  
- **Signed PDF:** download link when `signed_file_id` is set (existing).  
- **Internal / demo:** amber banner + existing module notice.  
- **Errors:** query error state on detail; send/void errors surfaced; **`failed`** envelope status banner.

## Tests (`tests/Feature/SignatureModuleTest.php`)

| Test | Expectation |
|------|-------------|
| Internal send with PDF | `200`, envelope `sent`, `provider_envelope_id` set. |
| Send without PDF | `422`. |
| Internal disabled | Empty `SIGNATURE_INTERNAL_ENVIRONMENTS` + no escape → `canUseInternalProvider('internal')` false. |
| Webhook invalid HMAC | `401`. |
| Webhook idempotency | Duplicate delivery → single `signature_events` row for key. |
| Completed flow | Signer `signed` after `signed` event; envelope `completed` + `signed_file_id` after `completed`. |

Run: `php artisan test --filter=SignatureModuleTest`

## Acceptance checklist

| Criterion | Status |
|-----------|--------|
| No production reliance on `Log::info` OTP | **Met** — logging gated to `local`/`testing` + `SIGNATURE_INTERNAL_OTP_LOG`. |
| Provider switchable by env | **Met** — `SIGNATURE_PROVIDER` + manager `match`. |
| Webhook secure + idempotent | **Met** — HMAC + unique idempotency key + `internal` rejected. |
| Signed document lifecycle | **Met** — `signed_file_id` / certificate / proof; provider payload path supported. |
| Tests pass | **Met** — see above. |

## Follow-up (real integrations)

1. Replace stubs with HTTP clients (OAuth / JWT per vendor).  
2. Map vendor-specific webhook shapes in dedicated mappers (keep `mapWebhookEvent` thin).  
3. In production, **always** set per-provider or global webhook secret; avoid relying on `local`/`testing` HMAC bypass.  
4. Persist provider raw webhook payloads (redacted) if compliance requires replay forensics.
