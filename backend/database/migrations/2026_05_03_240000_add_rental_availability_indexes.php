<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Composite indexes for rental availability overlap scans (vehicle + time window + status).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reservations', function (Blueprint $table): void {
            $table->index(['vehicle_id', 'status', 'desired_start_at', 'desired_end_at'], 'reservations_vehicle_status_window_idx');
        });

        Schema::table('contracts', function (Blueprint $table): void {
            $table->index(['vehicle_id', 'status', 'start_date', 'end_date'], 'contracts_vehicle_status_dates_idx');
        });

        Schema::table('missions', function (Blueprint $table): void {
            $table->index(['vehicle_id', 'status', 'scheduled_start_at', 'scheduled_end_at'], 'missions_vehicle_status_schedule_idx');
        });
    }

    public function down(): void
    {
        Schema::table('missions', function (Blueprint $table): void {
            $table->dropIndex('missions_vehicle_status_schedule_idx');
        });
        Schema::table('contracts', function (Blueprint $table): void {
            $table->dropIndex('contracts_vehicle_status_dates_idx');
        });
        Schema::table('reservations', function (Blueprint $table): void {
            $table->dropIndex('reservations_vehicle_status_window_idx');
        });
    }
};
