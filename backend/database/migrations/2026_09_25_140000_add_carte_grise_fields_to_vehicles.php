<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Le formulaire véhicule saisissait le statut de la carte grise et la validité
 * de l'immatriculation provisoire, mais rien ne les stockait : à la réédition
 * les deux champs revenaient vides.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('vehicles')) {
            return;
        }

        Schema::table('vehicles', function (Blueprint $table) {
            if (! Schema::hasColumn('vehicles', 'carte_grise_status')) {
                $table->string('carte_grise_status', 20)->nullable();
            }
            if (! Schema::hasColumn('vehicles', 'immat_provisoire_expiry')) {
                $table->date('immat_provisoire_expiry')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('vehicles')) {
            return;
        }

        Schema::table('vehicles', function (Blueprint $table) {
            foreach (['carte_grise_status', 'immat_provisoire_expiry'] as $column) {
                if (Schema::hasColumn('vehicles', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
