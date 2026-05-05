<?php

namespace App\Services;

use App\Models\AccountingAccount;
use App\Models\AccountingSetting;
use RuntimeException;
use Illuminate\Support\Str;

class AccountingMappingService
{
    /**
     * @return array<string,string>
     */
    public static function defaults(): array
    {
        return [
            'account_client' => '3421',
            'account_tva_collectee' => '4455',
            'account_banque' => '5141',
            'account_caisse' => '5161',
            'account_produit_location' => '7061',
            'account_vente_vo' => '7111',
            'account_immobilisation_vehicule' => '2340',
            'account_amortissement' => '6193',
            'account_amortissement_cumule' => '2834',
            'account_penalites_retard' => '7385',
            'account_produits_financiers' => '7321',
        ];
    }

    /**
     * @return array<string,string>
     */
    public function getMappings(?string $companyId): array
    {
        $defaults = self::defaults();
        $rows = AccountingSetting::query()
            ->where('company_id', $companyId)
            ->whereIn('setting_key', array_keys($defaults))
            ->pluck('setting_value', 'setting_key')
            ->toArray();

        return array_merge($defaults, array_filter($rows, fn ($v) => is_string($v) && $v !== ''));
    }

    /**
     * @param array<string,string> $payload
     */
    public function saveMappings(?string $companyId, array $payload): array
    {
        $allowed = array_keys(self::defaults());
        foreach ($payload as $key => $value) {
            if (!in_array($key, $allowed, true)) {
                continue;
            }
            AccountingSetting::query()->updateOrCreate(
                ['company_id' => $companyId, 'setting_key' => $key],
                [
                    'id' => AccountingSetting::query()
                        ->where('company_id', $companyId)
                        ->where('setting_key', $key)
                        ->value('id') ?? (string) Str::uuid(),
                    'setting_value' => $value,
                ]
            );
        }

        return $this->getMappings($companyId);
    }

    /**
     * @param array<int,string> $requiredKeys
     * @return array<string,string>
     */
    public function requireMappings(?string $companyId, array $requiredKeys): array
    {
        $map = $this->getMappings($companyId);
        foreach ($requiredKeys as $key) {
            $code = $map[$key] ?? null;
            if (!$code) {
                throw new RuntimeException("Mapping comptable manquant: {$key}");
            }
            $exists = AccountingAccount::query()
                ->where('code', $code)
                ->where('is_active', true)
                ->exists();
            if (!$exists) {
                throw new RuntimeException("Compte comptable introuvable/inactif pour {$key}: {$code}");
            }
        }

        return $map;
    }
}
