<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `audit_logs.entity_type` and `entity_id` were originally NOT NULL.
 * System-level events (login, logout, login_failed, scheduled jobs, exports) have
 * no Eloquent subject — make those columns nullable so we can persist them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->string('entity_type', 191)->nullable()->change();
            $table->string('entity_id', 191)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Intentionally not reverted — losing rows that depend on nullability would be lossy.
    }
};
