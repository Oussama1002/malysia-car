<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicle_geofence_states')) {
            return;
        }

        Schema::create('vehicle_geofence_states', function (Blueprint $table) {
            $table->uuid('vehicle_id');
            $table->uuid('geofence_id');
            $table->boolean('is_inside')->default(false);
            $table->timestamp('last_changed_at')->nullable();
            $table->timestamp('last_evaluated_at')->nullable();
            $table->json('metadata_json')->nullable();

            $table->primary(['vehicle_id', 'geofence_id']);
            $table->index(['geofence_id']);
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
            $table->foreign('geofence_id')->references('id')->on('geofences')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_geofence_states');
    }
};

