<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ajoute `is_active` sur les rôles. Un rôle désactivé reste intact (ses
 * permissions, ses utilisateurs) mais n'est plus proposé dans le formulaire
 * de création d'utilisateur. L'activation / désactivation se fait depuis
 * /settings/roles.
 *
 * Idempotent : on n'ajoute la colonne que si elle manque.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('roles') && ! Schema::hasColumn('roles', 'is_active')) {
            Schema::table('roles', function (Blueprint $table) {
                $table->boolean('is_active')->default(true)->after('is_system_role');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('roles') && Schema::hasColumn('roles', 'is_active')) {
            Schema::table('roles', function (Blueprint $table) {
                $table->dropColumn('is_active');
            });
        }
    }
};
