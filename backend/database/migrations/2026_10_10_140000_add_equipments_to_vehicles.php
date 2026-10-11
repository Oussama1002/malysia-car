<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Équipements du véhicule — case à cocher sur la fiche (airbags, ABS, ESP,
 * climatisation, GPS, caméra de recul, etc.). Liste figée côté app via
 * `Vehicle::EQUIPMENTS` ; on stocke juste les libellés cochés en JSON pour
 * éviter une table de pivot sur un référentiel qui bouge très peu.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->json('equipments')->nullable()->after('categorie');
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn('equipments');
        });
    }
};
