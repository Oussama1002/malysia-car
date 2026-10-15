<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `contracts.delete` était référencé par la route
 * `DELETE /v1/contracts/{id}` mais JAMAIS déclaré dans RbacSeeder — donc
 * tout appel au bouton Supprimer (mobile ou web) revenait en 403 silencieux,
 * le bouton paraissait cassé.
 *
 * Cette migration :
 *   1. Insère la permission si elle n'existe pas.
 *   2. L'accorde à DIRECTEUR, AGENT_COMMERCIAL (les deux rôles qui
 *      touchent déjà `contracts.terminate` dans la base). ADMIN a '*'
 *      donc rien à faire.
 *
 * Idempotent : safe à rejouer.
 */
return new class extends Migration {
    private const CODE = 'contracts.delete';
    private const DESCRIPTION = 'Supprimer un contrat';
    private const ROLE_CODES = ['DIRECTEUR', 'AGENT_COMMERCIAL'];

    public function up(): void
    {
        $permId = DB::table('permissions')->where('code', self::CODE)->value('id');
        if (!$permId) {
            $permId = DB::table('permissions')->insertGetId([
                'code'        => self::CODE,
                'module_name' => 'contracts',
                'action_name' => 'Contracts delete',
                'description' => self::DESCRIPTION,
            ]);
        }

        foreach (self::ROLE_CODES as $roleCode) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
            if (!$roleId) {
                continue;
            }
            $exists = DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->where('permission_id', $permId)
                ->exists();
            if (!$exists) {
                DB::table('role_permissions')->insert([
                    'role_id'       => $roleId,
                    'permission_id' => $permId,
                ]);
            }
        }
    }

    public function down(): void
    {
        $permId = DB::table('permissions')->where('code', self::CODE)->value('id');
        if (!$permId) {
            return;
        }
        DB::table('role_permissions')->where('permission_id', $permId)->delete();
        DB::table('permissions')->where('id', $permId)->delete();
    }
};
