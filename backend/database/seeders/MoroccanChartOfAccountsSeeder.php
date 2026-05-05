<?php

namespace Database\Seeders;

use App\Models\AccountingAccount;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class MoroccanChartOfAccountsSeeder extends Seeder
{
    /**
     * @return array<int,array<string,mixed>>
     */
    public static function rows(): array
    {
        return [
            ['code' => '2340', 'name' => 'Materiel de transport', 'account_type' => 'asset', 'normal_balance' => 'debit'],
            ['code' => '2834', 'name' => 'Amortissements cumules du materiel de transport', 'account_type' => 'contra', 'normal_balance' => 'credit'],
            ['code' => '6193', 'name' => 'Dotations aux amortissements', 'account_type' => 'expense', 'normal_balance' => 'debit'],
            ['code' => '3421', 'name' => 'Clients', 'account_type' => 'asset', 'normal_balance' => 'debit'],
            ['code' => '4411', 'name' => 'Fournisseurs', 'account_type' => 'liability', 'normal_balance' => 'credit'],
            ['code' => '5141', 'name' => 'Banques', 'account_type' => 'asset', 'normal_balance' => 'debit'],
            ['code' => '5161', 'name' => 'Caisse', 'account_type' => 'asset', 'normal_balance' => 'debit'],
            ['code' => '7061', 'name' => 'Produits locations LLD/LOA', 'account_type' => 'income', 'normal_balance' => 'credit'],
            ['code' => '7111', 'name' => 'Ventes vehicules occasion', 'account_type' => 'income', 'normal_balance' => 'credit'],
            ['code' => '7385', 'name' => 'Penalites de retard', 'account_type' => 'income', 'normal_balance' => 'credit'],
            ['code' => '7321', 'name' => 'Produits financiers', 'account_type' => 'income', 'normal_balance' => 'credit'],
            ['code' => '6125', 'name' => 'Entretien et reparations vehicules', 'account_type' => 'expense', 'normal_balance' => 'debit'],
            ['code' => '6134', 'name' => 'Primes d assurance', 'account_type' => 'expense', 'normal_balance' => 'debit'],
            ['code' => '4455', 'name' => 'TVA collectee', 'account_type' => 'liability', 'normal_balance' => 'credit'],
            ['code' => '3455', 'name' => 'TVA deductible', 'account_type' => 'asset', 'normal_balance' => 'debit'],
            ['code' => '4457', 'name' => 'TVA sur marge VO', 'account_type' => 'liability', 'normal_balance' => 'credit'],
            ['code' => '6512', 'name' => 'Valeur nette comptable des immob cedees', 'account_type' => 'expense', 'normal_balance' => 'debit'],
            ['code' => '7512', 'name' => 'Produits de cession des immobilisations', 'account_type' => 'income', 'normal_balance' => 'credit'],
        ];
    }

    public function run(): void
    {
        foreach (self::rows() as $row) {
            AccountingAccount::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'id' => AccountingAccount::query()->where('code', $row['code'])->value('id') ?? (string) Str::uuid(),
                    'company_id' => null,
                    'name' => $row['name'],
                    'account_type' => $row['account_type'],
                    'normal_balance' => $row['normal_balance'],
                    'is_detail' => true,
                    'is_active' => true,
                    'allow_direct_posting' => true,
                    'currency_code' => 'MAD',
                ]
            );
        }
    }
}
