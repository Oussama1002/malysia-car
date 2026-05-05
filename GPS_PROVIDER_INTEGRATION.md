# GPS Provider Integration

## Overview

DriveFlow supports provider-based GPS ingestion with normalized payloads and security controls.

- Public production webhook: `POST /api/v1/gps/webhooks/{provider}`
- Internal test endpoint (non-prod): `POST /api/v1/gps/positions`

## Provider Architecture

- `GpsProviderInterface`
- `GenericGpsProvider`
- `TeltonikaProviderStub`
- `WebhookGpsProvider`
- `GpsProviderManager`
- `GpsProviderIngestionService`

## Database

### `gps_providers`

Stores provider credentials and activation:

- `provider_code`
- `api_key`
- `webhook_secret`
- `ip_allowlist` (optional)
- `active`

### `gps_ingestion_events`

Tracks ingestion and idempotency:

- `idempotency_key` (unique)
- `provider_code`
- `device_imei`
- `status` (`accepted` / `rejected`)
- `reason`
- `raw_payload`

## Security Validation

For `POST /api/v1/gps/webhooks/{provider}`:

1. Provider must exist and be `active`
2. API key validation using header `X-API-KEY` when configured
3. HMAC validation using `X-SIGNATURE` when provider supports HMAC
   - Algorithm: `sha256`
   - Signed data: raw request body
4. Optional IP allowlist check (`ip_allowlist`)

## Normalized Internal Payload

Every provider payload is normalized to:

- `imei`
- `latitude`
- `longitude`
- `speed`
- `heading`
- `odometer`
- `ignition`
- `timestamp`

## Device Linking Rules

1. Device is resolved by IMEI (`gps_devices.device_imei`)
2. If device is unknown or not assigned to vehicle:
   - no position insert
   - ingestion event recorded as rejected
   - admin/fleet notification emitted

## Idempotency

Idempotency key is generated from provider + message/timestamp + coordinates + IMEI.

- Duplicate keys are ignored
- Duplicates are tracked in response summary

## Post-Ingestion Rules

After saving a normalized position:

- mileage sync to vehicle
- existing GPS rules are executed (`GpsRuleService::afterPositionSaved`)
  - alerts
  - geofence transitions
  - trips
  - immobilization checks

## Provider Setup Example

1. Insert/update provider in `gps_providers` with `active=1`
2. Configure `api_key` and/or `webhook_secret`
3. Configure optional `ip_allowlist`
4. Send provider webhook events to:
   - `POST /api/v1/gps/webhooks/{provider_code}`

## Notes

- Keep `/gps/positions` for QA/internal tests only.
- For production providers, always use `/gps/webhooks/{provider}`.
