<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Horodatage de l'affectation d'une mission à un agent. La console Missions
 * (admin) affiche désormais la date + l'heure d'affectation ; sans colonne
 * dédiée on ne pouvait pas distinguer la date de création de celle de
 * l'assignation (ni des réassignations).
 *
 * Backfill : pour les missions déjà assignées, on initialise `assigned_at`
 * avec `created_at` (meilleure approximation disponible rétroactivement).
 */
return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('missions') || Schema::hasColumn('missions', 'assigned_at')) {
            return;
        }

        Schema::table('missions', function (Blueprint $table) {
            $table->timestamp('assigned_at')->nullable()->after('assigned_user_id');
        });

        DB::table('missions')
            ->whereNotNull('assigned_user_id')
            ->whereNull('assigned_at')
            ->update(['assigned_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        if (Schema::hasTable('missions') && Schema::hasColumn('missions', 'assigned_at')) {
            Schema::table('missions', function (Blueprint $table) {
                $table->dropColumn('assigned_at');
            });
        }
    }
};
