<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Some environments have `company_settings` without the `payload` column
 * (the original create migration skipped its body via Schema::hasTable).
 * Backfill it here so the settings service can read/write again.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('company_settings')) {
            Schema::create('company_settings', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->unique();
                $table->json('payload')->nullable();
                $table->timestamps();
            });
            return;
        }

        if (!Schema::hasColumn('company_settings', 'payload')) {
            Schema::table('company_settings', function (Blueprint $table) {
                $table->json('payload')->nullable()->after('company_id');
            });
        }
    }

    public function down(): void
    {
        // No-op: keep the column even when rolling back this fix migration.
    }
};
