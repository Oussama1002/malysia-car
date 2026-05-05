# Notifications — real delivery report (DriveFlow)

**Date:** 2026-05-03  
**Scope:** Laravel API + React SPA — in-app centre, **queued e-mail (Mail)**, **SMS provider abstraction**, **delivery tracking**, **retry**, **tenant/company scoping**, **RBAC**, **tests**.

## Summary

Notifications are no longer placeholder `Log::info` stubs for e-mail/SMS. Each outbound notification creates **`notification_deliveries`** rows per channel (`in_app`, `email`, `sms`). **In-app** is marked **sent** immediately. **E-mail** and **SMS** use **`ShouldQueue` jobs** (`SendNotificationEmailDeliveryJob`, `SendNotificationSmsDeliveryJob`). Failures persist **`status=failed`**, **`error_message`**, **`failed_at`**, with **`attempts`** capped by **`NOTIFICATION_MAX_DELIVERY_ATTEMPTS`**. **ADMIN** and **DIRECTEUR** may **retry** failed e-mail/SMS deliveries for notifications in their **company** scope.

## Backend architecture

| Piece | Role |
|-------|------|
| `config/notifications.php` | `NOTIFICATION_EMAIL_ENABLED`, `NOTIFICATION_SMS_ENABLED`, `SMS_PROVIDER` (`log` \| `external`), `SMS_API_KEY`, `SMS_SENDER`, queue name, max attempts, `channels_by_priority` |
| `NotificationService` | Creates `app_notifications` + deliveries; resolves channels from **priority** when callers omit `channels`; **scopes `notifyRoles` by `company_id` on the related entity** when present |
| `SmsProviderInterface` | `send($phone, $message)` → `{ success, provider_message_id?, error? }` |
| `LogSmsProvider` | Local/staging: logs payload, returns stub id |
| `ExternalSmsProviderStub` | Production-ready stub id until Twilio/OVH is wired |
| `App\Mail\AppNotificationMail` | Simple HTML body for notification title/body/link |
| `notification_deliveries` | `channel`, `status`, `attempts`, `last_attempt_at`, `sent_at`, `failed_at`, `error_message`, `provider_message_id`, `entity_type`, `entity_id`, `priority` |

## API (`/api/v1/...`)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/notifications` | Filters: `unread_only`, `priority`, `module`, `failed_delivery`, `channel`, `include_deliveries` |
| GET | `/notifications/unread-count` | `{ unread: n }` |
| GET | `/notification-deliveries` | Paginated deliveries for **current user’s** notifications |
| POST | `/notifications/{id}/mark-read` | Sets `read_at`; marks in-app delivery **read** |
| POST | `/notifications/mark-all-read` | Bulk read + in-app delivery rows |
| POST | `/notifications/{id}/retry` | **ADMIN/DIRECTEUR** + `notifications.retry` — requeues failed e-mail/SMS |
| DELETE | `/notifications/{id}` | Owner-scoped delete |

**Scoping:** list/count/mark/delete use **`user_id = auth`** and, unless role is **ADMIN**, **`company_id` null OR matches user’s `company_id`**. Retry additionally ensures the notification’s `company_id` matches the manager’s company when set.

## RBAC

- Seeded permissions: **`notifications.view`**, **`notifications.manage`**, **`notifications.retry`** (legacy **`view_notifications`** kept).
- Routes use **`permission:notifications.*`** with **`erp.php`** fallback maps for dev without DB seed.
- **`notifications.retry`**: **ADMIN** (wildcard) + **DIRECTEUR** in role matrix.

## Domain events (categories)

Canonical codes live in `App\Notifications\NotificationCategory`. Existing controllers already emit many categories (`contract.*`, `invoice.overdue`, `gps.alert`, etc.). **Added:** `kyc.approved`, `kyc.rejected` (on approve/reject), **`signature.declined`** (on envelope decline).

## Audit

- Critical in-app notifications still log via `AuditLogger::record`.
- Outbound **e-mail/SMS** for sensitive modules (`signatures`, `legal`, `arrears`, `gps` + critical, or **finance/contracts**-related modules) enqueue **`AuditLogger::legalAction`** (`notification_outbound_queued`).

## Frontend

- **`notificationsApi`**: list with filters, `deliveries`, `retry`, DTOs for **deliveries**.
- **`NotificationsPage`**: filters (all / unread / critical / failed delivery), module + channel, **drawer** with delivery chips, **retry** (ADMIN/DIRECTEUR), entity navigation via **`resolveNotificationRoute`** (contracts, customers, fleet, invoices, arrears, signatures, KYC case, accidents → fleet list).
- **`AppLayout`**: existing **bell + unread count** (30s refetch) unchanged — uses real API.

## Tests (`tests/Feature/NotificationDeliveryTest.php`)

- In-app + e-mail job queued  
- SMS job queued when SMS enabled  
- Failed delivery retry increments queue  
- User index only returns own rows  
- Unread count endpoint  
- E-mail job sends `AppNotificationMail` when executed  

Run: `php artisan test --filter=NotificationDeliveryTest`

## Acceptance checklist

| Criterion | Status |
|-----------|--------|
| No mock/placeholder for e-mail/SMS | **Met** — jobs + providers |
| E-mail uses queue | **Met** — `SendNotificationEmailDeliveryJob` |
| SMS provider architecture | **Met** — interface + log + external stub |
| Failures tracked | **Met** — `notification_deliveries` |
| Retry works | **Met** — service + endpoint + tests |
| Frontend unread + delivery status | **Met** — bell + chips + filters |
| Company scope | **Met** — query + `notifyRoles` entity company |
| Tests pass | **Met** — see above |

## Follow-up

1. Wire **Twilio/OVH** (or other) inside `ExternalSmsProviderStub` replacement.  
2. Add **GET `/notifications/{id}`** if the SPA needs a single-notification fetch without list payload.  
3. **Throttle** retry endpoint per user.  
4. Optional: **broadcast** / WebSocket for instant in-app updates.
