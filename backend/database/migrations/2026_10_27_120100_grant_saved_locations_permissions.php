<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Catalogue + octroi des permissions de la bibliothèque de lieux.
 *
 *   - saved_locations.view   : lister / consulter les lieux enregistrés
 *   - saved_locations.manage : créer / supprimer un lieu enregistré
 *
 * Idempotent : les permissions sont insérées si absentes, puis rattachées
 * aux rôles sans doublon. ADMIN contourne déjà toute vérification de
 * permission (middleware), il n'a donc pas besoin d'être listé.
 * Les rôles qui créent des missions obtiennent view + manage ; les agents
 * terrain obtiennent view seulement.
 */
return new class extends Migration {
    /** @var array<string,array{module:string,action:string,desc:string}> */
    private const PERMS = [
        'saved_locations.view'   => ['module' => 'mobile_ops', 'action' => 'Voir les lieux enregistrés', 'desc' => 'Consulter la bibliothèque de lieux Google Maps'],
        'saved_locations.manage' => ['module' => 'mobile_ops', 'action' => 'Gérer les lieux enregistrés', 'desc' => 'Créer / supprimer un lieu Google Maps'],
    ];

    private const GRANTS = [
        'DIRECTEUR'           => ['saved_locations.view', 'saved_locations.manage'],
        'ASSISTANT'           => ['saved_locations.view', 'saved_locations.manage'],
        'AGENT_COMMERCIAL'    => ['saved_locations.view', 'saved_locations.manage'],
        'GESTIONNAIRE_FLOTTE' => ['saved_locations.view', 'saved_locations.manage'],
        'AGENT_LIVRAISON'     => ['saved_locations.view'],
        'MISSIONNAIRE'        => ['saved_locations.view'],
    ];

    public function up(): void
    {
        // Ensure the permission rows exist (permissions.id is a bigIncrements).
        foreach (self::PERMS as $code => $meta) {
            $exists = DB::table('permissions')->where('code', $code)->exists();
            if (! $exists) {
                DB::table('permissions')->insert([
                    'code' => $code,
                    'module_name' => $meta['module'],
                    'action_name' => $meta['action'],
                    'description' => $meta['desc'],
                ]);
            }
        }

        $permIds = DB::table('permissions')
            ->whereIn('code', array_keys(self::PERMS))
            ->pluck('id', 'code');

        foreach (self::GRANTS as $roleCode => $codes) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
            if (! $roleId) {
                continue;
            }
            foreach ($codes as $code) {
                $permId = $permIds[$code] ?? null;
                if (! $permId) {
                    continue;
                }
                $linked = DB::table('role_permissions')
                    ->where('role_id', $roleId)
                    ->where('permission_id', $permId)
                    ->exists();
                if (! $linked) {
                    DB::table('role_permissions')->insert([
                        'role_id' => $roleId,
                        'permission_id' => $permId,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        $permIds = DB::table('permissions')
            ->whereIn('code', array_keys(self::PERMS))
            ->pluck('id')
            ->all();

        if (! empty($permIds)) {
            DB::table('role_permissions')->whereIn('permission_id', $permIds)->delete();
            DB::table('permissions')->whereIn('id', $permIds)->delete();
        }
    }
};
