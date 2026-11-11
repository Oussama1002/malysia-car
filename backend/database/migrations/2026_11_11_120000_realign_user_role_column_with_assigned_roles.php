<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * La colonne héritée `users.role` servait de valeur par défaut
 * (AGENT_COMMERCIAL) à la création d'un compte via l'UI admin, qui n'envoie
 * que `role_ids`. `User::primaryRoleCode()` fait confiance à cette colonne
 * avant les rôles réellement liés : un MISSIONNAIRE (agent terrain) se
 * retrouvait donc classé AGENT_COMMERCIAL et voyait TOUS les modules sur le
 * web et le mobile.
 *
 * Ce backfill réaligne `users.role` sur le rôle le plus fort effectivement
 * assigné (même hiérarchie que config('erp.app_roles')). Idempotent : on ne
 * touche que les comptes dont la colonne diverge de leurs rôles.
 */
return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('users') || ! Schema::hasColumn('users', 'role')
            || ! Schema::hasTable('user_roles') || ! Schema::hasTable('roles')) {
            return;
        }

        $hierarchy = (array) config('erp.app_roles', []);
        $rank = static function (string $code) use ($hierarchy): int {
            $i = array_search($code, $hierarchy, true);

            return $i === false ? PHP_INT_MAX : $i;
        };

        // Rôles assignés par utilisateur (code).
        $assignments = DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->select('user_roles.user_id', 'roles.code')
            ->get()
            ->groupBy('user_id');

        foreach ($assignments as $userId => $rows) {
            $codes = $rows->pluck('code')->filter()->values()->all();
            if ($codes === []) {
                continue;
            }
            usort($codes, fn (string $a, string $b): int => $rank($a) <=> $rank($b));
            $strongest = $codes[0];

            DB::table('users')
                ->where('id', $userId)
                ->where(function ($q) use ($strongest) {
                    $q->where('role', '!=', $strongest)->orWhereNull('role');
                })
                ->update(['role' => $strongest]);
        }
    }

    public function down(): void
    {
        // Pas de rollback : on ne peut pas reconstituer la valeur erronée
        // précédente, et l'ancienne valeur était justement le bug.
    }
};
