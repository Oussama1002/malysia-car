<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicle_cost_profiles')) {
            return;
        }
        Schema::create('vehicle_cost_profiles', function (Blueprint $table) {
            $table->id();
            $table->uuid('vehicle_id');
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();

            $table->date('acquired_at')->nullable();
            $table->decimal('purchase_cost_mad', 12, 2)->nullable();
            $table->decimal('residual_value_mad', 12, 2)->nullable();
            $table->unsignedInteger('depreciation_months')->nullable();
            $table->string('depreciation_method')->nullable(); // STRAIGHT_LINE, ...

            $table->decimal('insurance_monthly_mad', 12, 2)->nullable();
            $table->decimal('tax_monthly_mad', 12, 2)->nullable();
            $table->decimal('gps_monthly_mad', 12, 2)->nullable();

            $table->timestamps();

            $table->unique(['vehicle_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_cost_profiles');
    }
};

