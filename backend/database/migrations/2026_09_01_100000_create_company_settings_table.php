<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Single-row-per-company key/value store for CRM-wide defaults (rental,
 * contracts, invoicing, payments, notifications). Kept as a JSON payload so
 * we can grow the shape without another migration each time.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('company_settings')) return;
        Schema::create('company_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->unique();
            $table->json('payload')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_settings');
    }
};
