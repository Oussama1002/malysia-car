<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Ajoute deux rôles métier demandés par le client :
 *
 *   - MISSIONNAIRE : agent terrain. Ne voit QUE les missions (démarrer /
 *     clôturer, check-list, photos, signature client, handovers, compteur).
 *     Pas de tableau de bord, pas de flotte, pas de finance, pas de
 *     paramètres.
 *   - ASSISTANT    : power user. Accès opérationnel complet SAUF
 *     l'administration des utilisateurs, des rôles et des paramètres système.
 *
 * Idempotent : crée le rôle seulement s'il manque, puis insère les paires
 * role_permission manquantes. Ne resynchronise ni ne touche aucun autre rôle,
 * donc les permissions personnalisées des rôles existants restent intactes.
 * (Le déploiement prod lance `migrate --force`, pas de reseed — d'où cette
 * migration en plus de la mise à jour de RbacSeeder.)
 *
 * Rollback : retire les permissions, les affectations et les deux rôles.
 */
return new class extends Migration {
    private function missionnaireCodes(): array
    {
        return [
            'view_mobile_ops', 'notifications.view', 'vehicles.view', 'customers.view',
            'odometer.create', 'gps.positions.view',
            'documents.view', 'documents.upload',
            'missions.view', 'missions.start', 'missions.complete',
            'missions.add_checklist', 'missions.upload_photo', 'missions.customer_signature',
            'rentals.handover_pickup', 'rentals.handover_return',
        ];
    }

    private function assistantDenied(): array
    {
        return [
            'manage_users', 'manage_roles', 'manage_branches', 'manage_settings',
            'users.view', 'users.create', 'users.update', 'users.delete', 'users.activate', 'users.assign_branches', 'users.view_login_history',
            'roles.view', 'roles.manage', 'roles.sync_permissions', 'permissions.view',
            'branches.manage',
        ];
    }

    public function up(): void
    {
        $now = now();

        $this->ensureRole('MISSIONNAIRE', 'Missionnaire', $now);
        $this->grant('MISSIONNAIRE', $this->missionnaireCodes());

        $this->ensureRole('ASSISTANT', 'Assistant(e)', $now);
        $allCodes = DB::table('permissions')->pluck('code')->all();
        $assistantCodes = array_values(array_diff($allCodes, $this->assistantDenied()));
        $this->grant('ASSISTANT', $assistantCodes);
    }

    public function down(): void
    {
        foreach (['MISSIONNAIRE', 'ASSISTANT'] as $code) {
            $roleId = DB::table('roles')->where('code', $code)->value('id');
            if (! $roleId) {
                continue;
            }
            DB::table('role_permissions')->where('role_id', $roleId)->delete();
            DB::table('user_roles')->where('role_id', $roleId)->delete();
            DB::table('roles')->where('id', $roleId)->delete();
        }
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
