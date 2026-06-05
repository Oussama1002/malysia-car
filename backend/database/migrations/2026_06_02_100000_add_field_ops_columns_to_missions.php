<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('missions', function (Blueprint $table) {
            if (! Schema::hasColumn('missions', 'mission_number')) {
                $table->string('mission_number', 25)->nullable()->after('id');
                $table->index(['company_id', 'mission_number']);
            }
            if (! Schema::hasColumn('missions', 'client_id')) {
                $table->uuid('client_id')->nullable()->after('vehicle_id');
                $table->index('client_id');
            }
            if (! Schema::hasColumn('missions', 'pickup_address')) {
                $table->string('pickup_address', 500)->nullable()->after('destination_address');
            }
            if (! Schema::hasColumn('missions', 'dropoff_address')) {
                $table->string('dropoff_address', 500)->nullable()->after('pickup_address');
            }
            if (! Schema::hasColumn('missions', 'planned_at')) {
                $table->timestamp('planned_at')->nullable()->after('scheduled_end_at');
            }
            if (! Schema::hasColumn('missions', 'arrived_at')) {
                $table->timestamp('arrived_at')->nullable()->after('actual_start_at');
            }
            if (! Schema::hasColumn('missions', 'accepted_at')) {
                $table->timestamp('accepted_at')->nullable()->after('planned_at');
            }
        });

        // ── field_vehicle_inspections ────────────────────────────────────
        if (! Schema::hasTable('field_vehicle_inspections')) {
            Schema::create('field_vehicle_inspections', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('mission_id');
                $table->uuid('vehicle_id')->nullable();
                $table->string('inspection_type', 20); // check_in, check_out
                $table->unsignedInteger('odometer_km')->nullable();
                $table->unsignedTinyInteger('fuel_level')->nullable(); // 0-100
                $table->string('exterior_condition', 20)->default('good');
                $table->string('interior_condition', 20)->default('good');
                $table->text('damage_notes')->nullable();
                $table->decimal('gps_lat', 10, 7)->nullable();
                $table->decimal('gps_lng', 10, 7)->nullable();
                $table->uuid('inspected_by')->nullable();
                $table->timestamps();

                $table->index('mission_id');
                $table->index('vehicle_id');
                $table->foreign('mission_id')->references('id')->on('missions')->cascadeOnDelete();
            });
        }

        // ── field_mission_signatures ─────────────────────────────────────
        if (! Schema::hasTable('field_mission_signatures')) {
            Schema::create('field_mission_signatures', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('mission_id');
                $table->string('signer_name', 255);
                $table->timestamp('signed_at');
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->decimal('gps_lat', 10, 7)->nullable();
                $table->decimal('gps_lng', 10, 7)->nullable();
                $table->string('storage_disk')->default('local');
                $table->string('storage_path');
                $table->timestamps();

                $table->index('mission_id');
                $table->foreign('mission_id')->references('id')->on('missions')->cascadeOnDelete();
            });
        }

        // ── field_mission_issues ─────────────────────────────────────────
        if (! Schema::hasTable('field_mission_issues')) {
            Schema::create('field_mission_issues', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('mission_id');
                $table->string('issue_type', 30);  // vehicle_damage, customer_absent, wrong_address, mechanical, other
                $table->string('severity', 15);     // low, medium, high, critical
                $table->text('description');
                $table->uuid('reported_by')->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->text('resolution_notes')->nullable();
                $table->timestamps();

                $table->index('mission_id');
                $table->foreign('mission_id')->references('id')->on('missions')->cascadeOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('field_mission_issues');
        Schema::dropIfExists('field_mission_signatures');
        Schema::dropIfExists('field_vehicle_inspections');

        Schema::table('missions', function (Blueprint $table) {
            $cols = ['mission_number', 'client_id', 'pickup_address', 'dropoff_address', 'planned_at', 'arrived_at', 'accepted_at'];
            foreach ($cols as $col) {
                if (Schema::hasColumn('missions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
