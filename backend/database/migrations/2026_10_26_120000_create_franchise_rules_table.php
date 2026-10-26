<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Règles de Franchise d'assurance par marque / modèle.
 *
 * Permet de définir un montant de franchise (caution) selon le véhicule :
 * p.ex. Clio 5 → 5 500, marque Bentley → 250 000. Le wizard de contrat
 * pré-remplit la Franchise d'assurance en résolvant, pour le véhicule
 * choisi : franchise propre du véhicule → règle modèle → règle marque →
 * valeur par défaut société (default_deposit_mad).
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('franchise_rules')) {
            return;
        }
        Schema::create('franchise_rules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->uuid('brand_id')->nullable()->index();
            $table->uuid('model_id')->nullable()->index();
            $table->unsignedInteger('amount_mad');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('franchise_rules');
    }
};
