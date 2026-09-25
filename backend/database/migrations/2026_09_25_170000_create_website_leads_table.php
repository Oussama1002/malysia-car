<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Les demandes de réservation venues du site public. Elles n'entrent pas
 * directement dans les réservations : un agent les qualifie d'abord, puis
 * crée le client et la réservation depuis DriveFlow.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('website_leads')) {
            return;
        }

        Schema::create('website_leads', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();

            $table->string('full_name', 160);
            $table->string('phone', 40);
            $table->string('email', 160)->nullable();
            $table->string('city', 120)->nullable();

            $table->uuid('vehicle_id')->nullable()->index();
            $table->string('vehicle_label', 160)->nullable();
            $table->dateTime('pickup_at')->nullable();
            $table->dateTime('return_at')->nullable();
            $table->text('message')->nullable();

            // new | contacted | converted | rejected
            $table->string('status', 20)->default('new')->index();
            $table->uuid('handled_by')->nullable();
            $table->timestamp('handled_at')->nullable();
            $table->text('handling_notes')->nullable();

            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('website_leads');
    }
};
