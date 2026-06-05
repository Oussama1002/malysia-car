<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reservation_drivers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('reservation_id');
            $table->string('driver_type', 20)->default('primary'); // primary | secondary
            $table->string('first_name');
            $table->string('last_name');
            $table->string('phone', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('cin_passport', 50)->nullable();
            $table->string('license_number', 50)->nullable();
            $table->date('license_expiry')->nullable();
            $table->string('relationship', 50)->nullable(); // conjoint, employé, ami, etc.
            $table->boolean('is_contract_signer')->default(false);
            $table->boolean('is_financially_responsible')->default(false);
            $table->string('status', 20)->default('active'); // active | removed
            $table->timestamps();

            $table->foreign('reservation_id')->references('id')->on('reservations')->cascadeOnDelete();
            $table->index(['reservation_id', 'driver_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reservation_drivers');
    }
};
