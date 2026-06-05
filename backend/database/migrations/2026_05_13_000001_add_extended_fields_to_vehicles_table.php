<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('vehicles')) {
            return;
        }
        Schema::table('vehicles', function (Blueprint $table) {
            if (! Schema::hasColumn('vehicles', 'vehicle_type')) {
                $table->string('vehicle_type', 50)->nullable()->after('vin');
            }
            if (! Schema::hasColumn('vehicles', 'numero_police')) {
                $table->string('numero_police', 100)->nullable()->after('vehicle_type');
            }
            if (! Schema::hasColumn('vehicles', 'nombre_cylindres')) {
                $table->unsignedTinyInteger('nombre_cylindres')->nullable()->after('numero_police');
            }
            if (! Schema::hasColumn('vehicles', 'gamme')) {
                $table->string('gamme', 50)->nullable()->after('nombre_cylindres');
            }
            if (! Schema::hasColumn('vehicles', 'mise_en_circulation')) {
                $table->date('mise_en_circulation')->nullable()->after('gamme');
            }
            if (! Schema::hasColumn('vehicles', 'date_immatriculation')) {
                $table->date('date_immatriculation')->nullable()->after('mise_en_circulation');
            }
            if (! Schema::hasColumn('vehicles', 'categorie')) {
                $table->string('categorie', 50)->nullable()->after('date_immatriculation');
            }
            if (! Schema::hasColumn('vehicles', 'immat_online')) {
                $table->string('immat_online', 100)->nullable()->after('categorie');
            }
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn([
                'vehicle_type', 'numero_police', 'nombre_cylindres',
                'gamme', 'mise_en_circulation', 'date_immatriculation',
                'categorie', 'immat_online',
            ]);
        });
    }
};
