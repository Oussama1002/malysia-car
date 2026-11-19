<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Comptable — synchronise le rôle « COMPTABLE » avec le bundle « Finance read
 * + edit » : écritures comptables, factures, paiements, trésorerie, taxes,
 * exercices, immobilisations, lecture contrats & clients, tableau de bord
 * finance + prévisions trésorerie IA, lecture arrears, sous-location
 * (lecture + paiements fournisseur). Lecture seule partout ailleurs.
 *
 * Idempotent : crée le rôle s'il manque puis ajoute les paires
 * role_permission manquantes ; ne retire aucune permission, ne touche pas les
 * utilisateurs déjà rattachés. Le déploiement prod lance `migrate --force`
 * sans reseed, d'où cette migration en plus de la mise à jour du RbacSeeder.
 *
 * Rollback : retire uniquement les paires role_permission POSÉES par cette
 * migration (pas de drop de rôle, trop risqué si des users y sont déjà liés).
 */
return new class extends Migration {
    private function comptableCodes(): array
    {
        // Même bundle que RbacSeeder::$roleMatrix['COMPTABLE']. Garder les deux
        // listes alignées : tout ajout ici doit être copié dans RbacSeeder.
        $finance_read = [
            'invoices.view', 'payments.view', 'customer_balance.view',
            'treasury.view', 'accounting.accounts.view', 'accounting.journals.view',
            'accounting.entries.view', 'accounting.reports.view', 'taxes.view',
            'fiscal_years.view', 'fixed_assets.view',
        ];
        $finance_write = [
            'invoices.create', 'invoices.update', 'invoices.delete',
            'invoices.issue', 'invoices.cancel', 'invoices.generate_from_contract',
            'payments.create', 'payments.allocate', 'payments.unallocate',
            'treasury.manage', 'treasury.import', 'treasury.match',
            'accounting.accounts.manage', 'accounting.journals.manage',
            'accounting.entries.manage', 'accounting.entries.post',
            'accounting.entries.cancel', 'accounting.bridge.run',
            'taxes.manage', 'fiscal_years.manage', 'fiscal_years.close',
            'fixed_assets.manage', 'fixed_assets.dispose', 'fixed_assets.depreciate',
        ];
        $contracts_read = [
            'contracts.view', 'contracts.view_installments',
            'contract_templates.view', 'signatures.view',
        ];
        $sub_rental_read = ['sub_rentals.view', 'supplier_agencies.view'];
        $sub_rental_finance = ['sub_rentals.payments'];

        return array_values(array_unique(array_merge(
            [
                'view_dashboard', 'view_contracts', 'view_finance',
                'manage_finance', 'view_arrears',
                'ai.predictions.cash_flow',
                'customers.view', 'customer_balance.view',
                'documents.view', 'documents.upload', 'documents.generate',
                'arrears.view',
                'dashboard.finance',
                'notifications.view',
            ],
            $finance_read, $finance_write,
            $contracts_read,
            $sub_rental_read, $sub_rental_finance,
        )));
    }

    public function up(): void
    {
        $now = now();

        $this->ensureRole('COMPTABLE', 'Comptable', $now);
        $this->grant('COMPTABLE', $this->comptableCodes());
    }

    public function down(): void
    {
        $roleId = DB::table('roles')->where('code', 'COMPTABLE')->value('id');
        if (! $roleId) {
            return;
        }
        $permIds = DB::table('permissions')
            ->whereIn('code', $this->comptableCodes())
            ->pluck('id')
            ->all();
        if (empty($permIds)) {
            return;
        }
        DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->whereIn('permission_id', $permIds)
            ->delete();
    }

    private function ensureRole(string $code, string $name, $now): void
    {
        if (DB::table('roles')->where('code', $code)->exists()) {
            return;
        }
        DB::table('roles')->insert([
            'code' => $code,
            'name' => $name,
            'is_system_role' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    private function grant(string $roleCode, array $codes): void
    {
        $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
        if (! $roleId) {
            return;
        }
        $permIds = DB::table('permissions')->whereIn('code', $codes)->pluck('id')->all();
        foreach ($permIds as $permId) {
            $exists = DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->where('permission_id', $permId)
                ->exists();
            if (! $exists) {
                DB::table('role_permissions')->insert([
                    'role_id' => $roleId,
                    'permission_id' => $permId,
                ]);
            }
        }
    }
};
