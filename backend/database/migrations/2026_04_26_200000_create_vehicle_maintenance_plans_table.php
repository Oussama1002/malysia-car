<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicle_maintenance_plans', function (Blueprint $table) {
            $table->id();
            $table->char('vehicle_id', 36)->index();
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
            $table->string('maintenance_type', 50); // OIL_CHANGE, TIRES, INSPECTION, BRAKES, FILTER, BATTERY, TIMING_BELT
            $table->unsignedInteger('interval_km')->nullable();
            $table->unsignedSmallInteger('interval_months')->nullable();
            $table->date('last_done_at')->nullable();
            $table->date('next_due_at')->nullable();
            $table->unsignedInteger('next_due_km')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->char('created_by', 36)->nullable();
            $table->timestamps();
            $table->index(['vehicle_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_maintenance_plans');
    }
};
