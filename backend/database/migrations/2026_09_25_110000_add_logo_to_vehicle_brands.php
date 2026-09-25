<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Logo propre à la marque : les logos livrés avec l'application ne couvrent
 * que les marques courantes, et une agence doit pouvoir téléverser le sien.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicle_brands') && ! Schema::hasColumn('vehicle_brands', 'logo_file_id')) {
            Schema::table('vehicle_brands', function (Blueprint $table) {
                $table->uuid('logo_file_id')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('vehicle_brands') && Schema::hasColumn('vehicle_brands', 'logo_file_id')) {
            Schema::table('vehicle_brands', function (Blueprint $table) {
                $table->dropColumn('logo_file_id');
            });
        }
    }
};
