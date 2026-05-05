<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicle_repairs', function (Blueprint $table) {
            $table->id();
            $table->char('vehicle_id', 36)->index();
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
            $table->string('repair_type', 50); // MECANIQUE, ELECTRIQUE, CARROSSERIE, PNEU, VITRE, OTHER
            $table->string('description', 500);
            $table->timestamp('reported_at')->useCurrent();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->unsignedSmallInteger('downtime_days')->nullable();
            $table->decimal('cost_amount', 12, 2)->nullable();
            $table->string('vendor_name', 100)->nullable();
            $table->string('status', 30)->default('reported'); // reported, in_progress, completed, cancelled
            $table->unsignedBigInteger('linked_accident_id')->nullable();
            $table->foreign('linked_accident_id')->references('id')->on('vehicle_accidents')->nullOnDelete();
            $table->char('created_by', 36)->nullable();
            $table->timestamps();
            $table->index(['vehicle_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_repairs');
    }
};
