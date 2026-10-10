<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paliers de tarif par durée pour chaque véhicule. 5 slots prédéfinis :
 *   1-2 j, 3-6 j, 7-14 j, 15-29 j, 30 j et +.
 *
 * On stocke le prix /jour de chaque palier en JSON pour éviter 5 colonnes.
 * `daily_rental_price` reste la source de vérité pour le palier 1-2 j (et
 * pour tous les codes existants qui n'ont pas encore de notion de paliers).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->json('rental_price_tiers')->nullable()->after('daily_rental_price');
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn('rental_price_tiers');
        });
    }
};
