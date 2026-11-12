<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Le TenantScope filtre les missions par agence (branch_id) pour les rôles
 * terrain. Une mission créée par un compte sans agence (ADMIN/DIRECTEUR) reste
 * sans branch_id : l'agent missionnaire à qui elle est assignée ne la voyait
 * donc jamais, bien qu'elle lui soit affectée.
 *
 * Backfill : on rattache chaque mission déjà assignée mais sans agence à
 * l'agence de son agent. Idempotent : on ne touche que les missions à
 * branch_id nul dont l'agent a bien une agence.
 */
return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('missions') || ! Schema::hasTable('users')
            || ! Schema::hasColumn('missions', 'branch_id')
            || ! Schema::hasColumn('users', 'branch_id')) {
            return;
        }

        DB::table('missions')
            ->whereNotNull('assigned_user_id')
            ->whereNull('branch_id')
            ->orderBy('id')
            ->chunkById(300, function ($rows) {
                foreach ($rows as $row) {
                    $branchId = DB::table('users')
                        ->where('id', $row->assigned_user_id)
                        ->value('branch_id');
                    if (! empty($branchId)) {
                        DB::table('missions')
                            ->where('id', $row->id)
                            ->update(['branch_id' => $branchId]);
                    }
                }
            });
    }

    public function down(): void
    {
        // Pas de rollback : on ne peut pas distinguer les branch_id rétablis par
        // ce backfill de ceux renseignés par ailleurs.
    }
};
