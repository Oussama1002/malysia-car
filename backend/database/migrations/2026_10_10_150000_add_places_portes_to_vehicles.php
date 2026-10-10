<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Nombre de places et nombre de portes du véhicule — champs saisis dans le
 * modal « Nouveau véhicule » web + mobile. Entiers nullables pour que
 * l'ancien parc reste importable sans valeur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->unsignedTinyInteger('nombre_places')->nullable()->after('nombre_cylindres');
            $table->unsignedTinyInteger('nombre_portes')->nullable()->after('nombre_places');
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn(['nombre_places', 'nombre_portes']);
        });
    }
};
