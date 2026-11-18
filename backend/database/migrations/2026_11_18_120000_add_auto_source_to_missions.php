<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Generic provenance link for auto-generated missions so the automation
     * service stays idempotent: one mission per (source_type, source_id,
     * mission_type). Covers reservations, sub-rentals and future fleet events
     * without a column per source.
     */
    public function up(): void
    {
        Schema::table('missions', function (Blueprint $table) {
            if (! Schema::hasColumn('missions', 'auto_source_type')) {
                $table->string('auto_source_type', 40)->nullable()->after('created_by');
            }
            if (! Schema::hasColumn('missions', 'auto_source_id')) {
                $table->uuid('auto_source_id')->nullable()->after('auto_source_type');
                $table->index(['auto_source_type', 'auto_source_id', 'mission_type'], 'missions_auto_source_idx');
            }
        });
    }

    public function down(): void
    {
        Schema::table('missions', function (Blueprint $table) {
            if (Schema::hasColumn('missions', 'auto_source_id')) {
                $table->dropIndex('missions_auto_source_idx');
                $table->dropColumn('auto_source_id');
            }
            if (Schema::hasColumn('missions', 'auto_source_type')) {
                $table->dropColumn('auto_source_type');
            }
        });
    }
};
