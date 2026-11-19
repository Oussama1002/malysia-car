<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * user_permissions — surcouche par utilisateur au-dessus du rôle.
 *
 * Deux effets possibles :
 *   - 'grant'  : la permission est AJOUTÉE à cet utilisateur, même si son
 *                rôle ne la porte pas.
 *   - 'revoke' : la permission est RETIRÉE à cet utilisateur, même si son
 *                rôle la porte.
 *
 * Permet aux admins d'affiner les accès sans multiplier les rôles : deux
 * Assistant(e)s peuvent avoir des dérogations différentes.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('user_permissions')) {
            return;
        }
        Schema::create('user_permissions', function (Blueprint $table) {
            $table->uuid('user_id');
            $table->unsignedBigInteger('permission_id');
            $table->string('effect', 10); // grant | revoke
            $table->timestamps();

            $table->primary(['user_id', 'permission_id']);
            $table->index('permission_id');
            $table->index('effect');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_permissions');
    }
};
