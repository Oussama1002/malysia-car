<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('gps_devices')) {
            return;
        }
        if (Schema::hasColumn('gps_devices', 'vehicle_id')) {
            return;
        }

        Schema::table('gps_devices', function (Blueprint $table) {
            $table->uuid('vehicle_id')->nullable()->after('company_id');
            $table->index(['vehicle_id'], 'gps_dev_vehicle_idx');
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('gps_devices')) {
            return;
        }
        if (! Schema::hasColumn('gps_devices', 'vehicle_id')) {
            return;
        }

        Schema::table('gps_devices', function (Blueprint $table) {
            $table->dropForeign(['vehicle_id']);
            $table->dropIndex('gps_dev_vehicle_idx');
            $table->dropColumn('vehicle_id');
        });
    }
};

