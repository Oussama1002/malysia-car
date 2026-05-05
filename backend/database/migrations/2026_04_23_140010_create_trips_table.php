<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('trips')) {
            return;
        }

        Schema::create('trips', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('vehicle_id');
            $table->uuid('gps_device_id')->nullable();

            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();

            $table->decimal('start_latitude', 10, 7)->nullable();
            $table->decimal('start_longitude', 10, 7)->nullable();
            $table->decimal('end_latitude', 10, 7)->nullable();
            $table->decimal('end_longitude', 10, 7)->nullable();

            $table->decimal('distance_km', 10, 2)->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->decimal('max_speed_kmh', 6, 2)->nullable();

            $table->json('metadata_json')->nullable();
            $table->timestamps();

            $table->index(['vehicle_id', 'started_at']);
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
            $table->foreign('gps_device_id')->references('id')->on('gps_devices')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trips');
    }
};

