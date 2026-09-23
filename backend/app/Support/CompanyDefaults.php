<?php

namespace App\Support;

use App\Models\CompanySetting;

/**
 * Values the agency sets once in Paramètres and expects everywhere:
 * the default VAT rate, the kilometres included per month…
 */
class CompanyDefaults
{
    /** @var array<string, array<string, mixed>> */
    private static array $cache = [];

    public static function get(?string $companyId, string $path, mixed $default = null): mixed
    {
        if (! $companyId) {
            return $default;
        }

        if (! array_key_exists($companyId, self::$cache)) {
            $payload = CompanySetting::query()->where('company_id', $companyId)->value('payload');
            self::$cache[$companyId] = is_array($payload) ? $payload : (array) json_decode((string) $payload, true);
        }

        $value = data_get(self::$cache[$companyId], $path);

        return $value === null || $value === '' ? $default : $value;
    }

    /** Taux de TVA par défaut, en pourcentage. */
    public static function vatRate(?string $companyId): float
    {
        return (float) self::get($companyId, 'invoicing.default_tva_pct', 0);
    }

    /** Km inclus par mois. */
    public static function kmPerMonth(?string $companyId): int
    {
        return (int) self::get($companyId, 'contracts.default_km_per_month', 0);
    }

    public static function flush(): void
    {
        self::$cache = [];
    }
}
