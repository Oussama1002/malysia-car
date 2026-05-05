<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('geofence_vehicle')) {
            return;
        }

        Schema::create('geofence_vehicle', function (Blueprint $table) {
            $table->uuid('geofence_id');
            $table->uuid('vehicle_id');
            $table->timestamp('assigned_at')->useCurrent();
            $table->uuid('assigned_by')->nullable();

            $table->primary(['geofence_id', 'vehicle_id']);
            $table->index(['vehicle_id']);
            $table->foreign('geofence_id')->references('id')->on('geofences')->cascadeOnDelete();
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('geofence_vehicle');
    }
};

