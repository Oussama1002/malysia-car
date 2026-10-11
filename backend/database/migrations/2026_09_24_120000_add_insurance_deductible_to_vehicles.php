<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Franchise d'assurance propre au véhicule : elle sert de montant par défaut
 * sur les contrats de ce véhicule, une petite citadine et un 4x4 n'ayant pas
 * la même franchise.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicles') && ! Schema::hasColumn('vehicles', 'insurance_deductible')) {
            Schema::table('vehicles', function (Blueprint $table) {
                $table->decimal('insurance_deductible', 12, 2)->nullable()->after('daily_rental_price');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('vehicles') && Schema::hasColumn('vehicles', 'insurance_deductible')) {
            Schema::table('vehicles', function (Blueprint $table) {
                $table->dropColumn('insurance_deductible');
            });
        }
    }
};
