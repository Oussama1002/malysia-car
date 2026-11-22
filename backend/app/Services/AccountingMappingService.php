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
            'account_fournisseur' => '4411',
            'account_charge_entretien' => '6125',
            'account_charge_assurance' => '6134',
            'account_charge_defaut' => '6181',
            'account_tva_deductible' => '3455',
            'account_charge_location' => '6136',
            'account_wallet' => '4421',
            'account_wallet_adjustment' => '6714',
        ];
    }

    /**
     * Map a free-text expense/fixed-charge category to a mapping key.
     * Unknown categories fall through to the default charge account.
     *
     * @return string one of the keys returned by self::defaults()
     */
    public static function expenseAccountKeyFor(?string $category): string
    {
        $c = strtolower(trim((string) $category));
        if ($c === '') return 'account_charge_defaut';
        if (str_contains($c, 'entretien') || str_contains($c, 'maintenance')
            || str_contains($c, 'repair') || str_contains($c, 'reparation')
            || str_contains($c, 'réparation')) {
            return 'account_charge_entretien';
        }
        if (str_contains($c, 'assurance') || str_contains($c, 'insurance')) {
            return 'account_charge_assurance';
        }
        return 'account_charge_defaut';
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
