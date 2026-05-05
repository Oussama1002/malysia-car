<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicle_accidents', function (Blueprint $table) {
            $table->id();
            $table->char('vehicle_id', 36)->index();
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
            $table->char('driver_user_id', 36)->nullable();
            $table->char('contract_id', 36)->nullable();
            $table->date('accident_date');
            $table->string('location', 255)->nullable();
            $table->text('description')->nullable();
            $table->string('severity', 20)->default('minor'); // minor, major, total_loss
            $table->string('responsible_party', 30)->nullable(); // client, third_party, company
            $table->string('police_report_number', 100)->nullable();
            $table->string('insurance_claim_number', 100)->nullable();
            $table->decimal('estimated_damage_cost', 12, 2)->nullable();
            $table->decimal('final_cost', 12, 2)->nullable();
            $table->string('status', 30)->default('declared'); // declared, under_review, repaired, closed
            $table->char('created_by', 36)->nullable();
            $table->timestamps();
            $table->index(['vehicle_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_accidents');
    }
};
