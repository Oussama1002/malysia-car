<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicle_maintenance_events')) {
            return;
        }
        Schema::create('vehicle_maintenance_events', function (Blueprint $table) {
            $table->id();
            $table->uuid('vehicle_id');
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();

            $table->string('type')->nullable(); // OIL_CHANGE, TIRES, TECH_CONTROL, REPAIR, ...
            $table->string('title');
            $table->text('description')->nullable();
            $table->date('performed_at')->nullable();
            $table->unsignedInteger('odometer_km')->nullable();

            $table->string('vendor')->nullable();
            $table->decimal('cost_mad', 12, 2)->nullable();

            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->index(['vehicle_id', 'performed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_maintenance_events');
    }
};

