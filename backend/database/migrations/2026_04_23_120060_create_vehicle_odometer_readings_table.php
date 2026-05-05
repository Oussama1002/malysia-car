<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicle_odometer_readings')) {
            return;
        }
        Schema::create('vehicle_odometer_readings', function (Blueprint $table) {
            $table->id();
            $table->uuid('vehicle_id');
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();

            $table->unsignedInteger('reading_km');
            $table->timestamp('read_at')->useCurrent();
            $table->string('source')->default('MANUAL'); // MANUAL, GPS, CONTRACT, ...
            $table->string('note')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['vehicle_id', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_odometer_readings');
    }
};

