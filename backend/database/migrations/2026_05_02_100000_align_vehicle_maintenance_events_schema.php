<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Align vehicle_maintenance_events.created_by with UUID users.id.
 * Add standalone index on performed_at for fleet-wide monthly cost queries (in addition to composite vehicle_id + performed_at).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('vehicle_maintenance_events')) {
            return;
        }

        Schema::table('vehicle_maintenance_events', function (Blueprint $table) {
            if (Schema::hasColumn('vehicle_maintenance_events', 'created_by')) {
                $table->dropColumn('created_by');
            }
        });

        Schema::table('vehicle_maintenance_events', function (Blueprint $table) {
            $table->uuid('created_by')->nullable()->after('cost_mad');
        });

        Schema::table('vehicle_maintenance_events', function (Blueprint $table) {
            $table->index('performed_at');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('vehicle_maintenance_events')) {
            return;
        }

        Schema::table('vehicle_maintenance_events', function (Blueprint $table) {
            $table->dropIndex(['performed_at']);
        });

        Schema::table('vehicle_maintenance_events', function (Blueprint $table) {
            if (Schema::hasColumn('vehicle_maintenance_events', 'created_by')) {
                $table->dropColumn('created_by');
            }
        });

        Schema::table('vehicle_maintenance_events', function (Blueprint $table) {
            $table->unsignedBigInteger('created_by')->nullable()->after('cost_mad');
        });
    }
};
