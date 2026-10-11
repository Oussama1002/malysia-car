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
        $key = $companyId ?: '__none__';

        if (! array_key_exists($key, self::$cache)) {
            $payload = $companyId
                ? CompanySetting::query()->where('company_id', $companyId)->value('payload')
                // Invoices and contracts do not always carry a company_id. With
                // a single company — the usual case — its settings still apply.
                : (CompanySetting::query()->count() === 1 ? CompanySetting::query()->value('payload') : null);

            $saved = is_array($payload) ? $payload : (array) json_decode((string) $payload, true);

            // The settings screen shows defaults merged over what is saved, so
            // a rate displayed as 20% must apply even when nobody pressed Save.
            self::$cache[$key] = array_replace_recursive(
                \App\Http\Controllers\Api\V1\CompanySettingsController::defaults(),
                $saved,
            );
        }

        $value = data_get(self::$cache[$key], $path);

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
