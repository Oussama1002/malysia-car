<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasTable('vehicles')) {
            return;
        }
        Schema::table('vehicles', function (Blueprint $table) {
            if (! Schema::hasColumn('vehicles', 'fuel_type')) {
                $table->string('fuel_type', 50)->nullable()->after('color');
            }
            if (! Schema::hasColumn('vehicles', 'fiscal_power')) {
                $table->unsignedSmallInteger('fiscal_power')->nullable()->after('fuel_type');
            }
            if (! Schema::hasColumn('vehicles', 'registration_card_number')) {
                $table->string('registration_card_number', 100)->nullable()->after('registration_number');
            }
            if (! Schema::hasColumn('vehicles', 'insurance_expiry')) {
                $table->date('insurance_expiry')->nullable()->after('registration_card_number');
            }
            if (! Schema::hasColumn('vehicles', 'tech_control_expiry')) {
                $table->date('tech_control_expiry')->nullable()->after('insurance_expiry');
            }
            if (! Schema::hasColumn('vehicles', 'vignette_expiry')) {
                $table->date('vignette_expiry')->nullable()->after('tech_control_expiry');
            }
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn(['fuel_type', 'fiscal_power', 'registration_card_number', 'insurance_expiry', 'tech_control_expiry', 'vignette_expiry']);
        });
    }
};
