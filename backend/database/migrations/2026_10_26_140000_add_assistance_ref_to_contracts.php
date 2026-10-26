<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Réf. dossier assistance — référence du dossier d'assistance, saisie sur le
 * contrat pour les clients entreprise. Idempotent.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('contracts') && ! Schema::hasColumn('contracts', 'assistance_ref')) {
            Schema::table('contracts', function (Blueprint $table) {
                $table->string('assistance_ref', 120)->nullable()->after('notes');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('contracts') && Schema::hasColumn('contracts', 'assistance_ref')) {
            Schema::table('contracts', function (Blueprint $table) {
                $table->dropColumn('assistance_ref');
            });
        }
    }
};
