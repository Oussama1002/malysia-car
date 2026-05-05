<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Persists audit trail rows to `audit_logs`.
 *
 * Helpers cover the shapes we care about:
 *  - created/updated/deleted     classic CRUD diffing
 *  - statusChanged               state transitions
 *  - financialAction             marks legal_significance=true (invoices, payments, accounting)
 *  - legalAction                 idem for KYC, signatures, blacklist, contentieux
 *  - record()                    free-form (login/logout, exports, jobs)
 *
 * Calls never throw — auditing failures should never break a business action,
 * so any exception is downgraded to Log::warning.
 */
class AuditLogger
{
    /**
     * Fallback tenant for system/unauthenticated events (e.g. login_failed).
     * Keeps audit writes compatible with schemas where `company_id` is NOT NULL.
     */
    private const SYSTEM_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

    public static function created(
        Model $subject,
        ?User $user = null,
        ?array $newData = null,
        ?string $module = null,
        ?Request $request = null,
        bool $legal = false,
        ?string $label = null,
    ): ?AuditLog {
        return self::write(
            action: 'created',
            label: $label ?? sprintf('Création %s', class_basename($subject)),
            subject: $subject,
            user: $user,
            before: null,
            after: $newData ?? self::diffable($subject),
            module: $module ?? self::guessModule($subject),
            legal: $legal,
            request: $request,
        );
    }

    public static function updated(
        Model $subject,
        ?User $user = null,
        ?array $before = null,
        ?array $after = null,
        ?string $module = null,
        ?Request $request = null,
        bool $legal = false,
        ?string $label = null,
    ): ?AuditLog {
        if ($before === null && $after === null) {
            $original = $subject->getOriginal();
            $changes = $subject->getChanges();
            $before = array_intersect_key($original, $changes);
            $after = $changes;
        }

        return self::write(
            action: 'updated',
            label: $label ?? sprintf('Mise à jour %s', class_basename($subject)),
            subject: $subject,
            user: $user,
            before: $before,
            after: $after,
            module: $module ?? self::guessModule($subject),
            legal: $legal,
            request: $request,
        );
    }

    public static function deleted(
        Model $subject,
        ?User $user = null,
        ?string $module = null,
        ?Request $request = null,
        bool $legal = false,
        ?string $label = null,
    ): ?AuditLog {
        return self::write(
            action: 'deleted',
            label: $label ?? sprintf('Suppression %s', class_basename($subject)),
            subject: $subject,
            user: $user,
            before: self::diffable($subject),
            after: null,
            module: $module ?? self::guessModule($subject),
            legal: $legal,
            request: $request,
        );
    }

    public static function statusChanged(
        Model $subject,
        string $fromStatus,
        string $toStatus,
        ?User $user = null,
        ?Request $request = null,
        ?string $module = null,
        bool $legal = false,
        ?string $label = null,
        ?array $extra = null,
    ): ?AuditLog {
        return self::write(
            action: 'status_changed',
            label: $label ?? sprintf('Statut %s → %s', $fromStatus, $toStatus),
            subject: $subject,
            user: $user,
            before: ['status' => $fromStatus] + (array) $extra,
            after: ['status' => $toStatus] + (array) $extra,
            module: $module ?? self::guessModule($subject),
            legal: $legal,
            request: $request,
        );
    }

    public static function financialAction(
        string $action,
        Model $subject,
        ?User $user = null,
        ?array $before = null,
        ?array $after = null,
        ?Request $request = null,
        ?string $label = null,
    ): ?AuditLog {
        return self::write(
            action: $action,
            label: $label ?? $action,
            subject: $subject,
            user: $user,
            before: $before,
            after: $after,
            module: self::guessModule($subject) ?? 'finance',
            legal: true,
            request: $request,
        );
    }

    public static function legalAction(
        string $action,
        Model $subject,
        ?User $user = null,
        ?array $before = null,
        ?array $after = null,
        ?Request $request = null,
        ?string $label = null,
        ?string $module = null,
    ): ?AuditLog {
        return self::write(
            action: $action,
            label: $label ?? $action,
            subject: $subject,
            user: $user,
            before: $before,
            after: $after,
            module: $module ?? self::guessModule($subject) ?? 'legal',
            legal: true,
            request: $request,
        );
    }

    public static function record(
        string $action,
        ?User $user = null,
        ?string $entityType = null,
        ?string $entityId = null,
        ?array $before = null,
        ?array $after = null,
        ?string $module = null,
        bool $legal = false,
        ?Request $request = null,
        ?string $label = null,
    ): ?AuditLog {
        try {
            $request ??= app('request');
        } catch (Throwable) {
            $request = null;
        }

        try {
            return AuditLog::create([
                'id' => (string) Str::uuid(),
                'company_id' => $user?->company_id ?? self::SYSTEM_COMPANY_ID,
                'branch_id' => null,
                'user_id' => $user?->getKey(),
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'action_type' => $action,
                'action_label' => $label ?? $action,
                'module_name' => $module ?? 'system',
                'ip_address' => $request?->ip(),
                'user_agent' => substr((string) $request?->userAgent(), 0, 512),
                'before_data' => self::sanitise($before),
                'after_data' => self::sanitise($after),
                'legal_significance' => $legal,
                'created_at' => now(),
            ]);
        } catch (Throwable $e) {
            Log::warning('audit_log.write_failed', ['err' => $e->getMessage(), 'action' => $action]);
            return null;
        }
    }

    /** @internal */
    private static function write(
        string $action,
        string $label,
        Model $subject,
        ?User $user,
        ?array $before,
        ?array $after,
        ?string $module,
        bool $legal,
        ?Request $request,
    ): ?AuditLog {
        try {
            $request ??= app('request');
        } catch (Throwable) {
            $request = null;
        }

        try {
            $companyId = $user?->company_id
                ?? (method_exists($subject, 'getAttribute') ? $subject->getAttribute('company_id') : null);
            $branchId = method_exists($subject, 'getAttribute') ? $subject->getAttribute('branch_id') : null;

            return AuditLog::create([
                'id' => (string) Str::uuid(),
                'company_id' => $companyId ?? self::SYSTEM_COMPANY_ID,
                'branch_id' => $branchId,
                'user_id' => $user?->getKey(),
                'entity_type' => $subject->getMorphClass(),
                'entity_id' => (string) $subject->getKey(),
                'action_type' => $action,
                'action_label' => $label,
                'module_name' => $module ?? 'general',
                'ip_address' => $request?->ip(),
                'user_agent' => substr((string) $request?->userAgent(), 0, 512),
                'before_data' => self::sanitise($before),
                'after_data' => self::sanitise($after),
                'legal_significance' => $legal,
                'created_at' => now(),
            ]);
        } catch (Throwable $e) {
            Log::warning('audit_log.write_failed', [
                'err' => $e->getMessage(),
                'action' => $action,
                'entity' => $subject::class,
            ]);
            return null;
        }
    }

    /** Backwards-compat shim. */
    public static function log(
        string $action,
        Model $subject,
        ?User $user = null,
        ?array $old = null,
        ?array $new = null
    ): void {
        self::write(
            action: $action,
            label: $action,
            subject: $subject,
            user: $user,
            before: $old,
            after: $new,
            module: self::guessModule($subject),
            legal: false,
            request: null,
        );
    }

    public static function guessModule(Model $subject): ?string
    {
        $class = strtolower(class_basename($subject));
        return match (true) {
            str_contains($class, 'contract') => 'contracts',
            str_contains($class, 'invoice') || str_contains($class, 'payment') || str_contains($class, 'accounting') => 'finance',
            str_contains($class, 'kyc') => 'kyc',
            str_contains($class, 'vehicle') || str_contains($class, 'accident') || str_contains($class, 'repair') || str_contains($class, 'maintenance') => 'fleet',
            str_contains($class, 'customer') => 'customers',
            str_contains($class, 'credit') => 'credit',
            str_contains($class, 'arrears') || str_contains($class, 'legal') => 'legal',
            str_contains($class, 'signature') || str_contains($class, 'envelope') => 'signature',
            str_contains($class, 'reservation') || str_contains($class, 'mission') => 'rentals',
            str_contains($class, 'gps') || str_contains($class, 'geofence') || str_contains($class, 'trip') => 'gps',
            str_contains($class, 'user') || str_contains($class, 'role') || str_contains($class, 'permission') || str_contains($class, 'branch') => 'admin',
            str_contains($class, 'usedcar') => 'used_cars',
            default => 'general',
        };
    }

    private static function sanitise(?array $data): ?array
    {
        if ($data === null) return null;
        $hide = ['password', 'password_hash', 'remember_token', 'api_token', 'secret'];
        foreach ($hide as $k) unset($data[$k]);
        return $data;
    }

    /** @return array<string,mixed> */
    private static function diffable(Model $subject): array
    {
        $arr = $subject->attributesToArray();
        return self::sanitise($arr) ?? [];
    }
}
