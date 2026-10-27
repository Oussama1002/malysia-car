<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bibliothèque de lieux Google Maps réutilisables.
 *
 * Un agent enregistre un lieu (titre + lien Google Maps collé + adresse
 * facultative) depuis le formulaire « Créer une mission » ; le lieu est
 * partagé au niveau société et réapparaît dans les formulaires suivants.
 * Les coordonnées (latitude/longitude) sont extraites du lien quand elles
 * y figurent, pour afficher un aperçu carte fiable.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('saved_locations')) {
            return;
        }

        Schema::create('saved_locations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->uuid('branch_id')->nullable()->index();
            $table->string('title', 150);
            $table->string('address', 500)->nullable();
            $table->text('maps_url');
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->uuid('created_by')->nullable()->index();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saved_locations');
    }
};
