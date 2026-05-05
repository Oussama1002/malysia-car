<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('credit_applications')) {
            Schema::create('credit_applications', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->uuid('customer_id')->index();
                $table->uuid('vehicle_id')->nullable()->index();
                $table->string('application_type', 30);
                $table->decimal('requested_amount', 18, 2);
                $table->decimal('down_payment_amount', 18, 2)->nullable();
                $table->integer('requested_duration_months')->nullable();
                $table->decimal('monthly_income', 18, 2)->nullable();
                $table->decimal('monthly_debt', 18, 2)->nullable();
                $table->decimal('debt_ratio', 8, 4)->nullable();
                $table->string('scoring_status', 30)->default('pending');
                $table->string('decision_status', 30)->default('draft');
                $table->timestamp('submitted_at')->nullable();
                $table->timestamp('decided_at')->nullable();
                $table->uuid('decided_by')->nullable();
                $table->text('rejection_reason')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('contracts')) {
            Schema::create('contracts', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('contract_number', 80);
                $table->unique(['company_id', 'contract_number'], 'contracts_company_contract_number_unique');
                $table->string('contract_type', 30);
                $table->uuid('customer_id')->index();
                $table->uuid('vehicle_id')->index();
                $table->uuid('template_id')->nullable()->index();
                $table->uuid('credit_application_id')->nullable()->index();
                $table->string('status', 30)->default('draft');
                $table->string('legal_status', 30)->default('pending');
                $table->string('signature_status', 30)->default('pending');
                $table->date('start_date')->nullable();
                $table->date('end_date')->nullable();
                $table->integer('duration_months')->nullable();
                $table->string('currency_code', 3)->default('MAD');
                $table->decimal('base_amount', 18, 2)->nullable();
                $table->decimal('monthly_payment', 18, 2)->nullable();
                $table->decimal('down_payment_amount', 18, 2)->nullable();
                $table->decimal('buyout_option_amount', 18, 2)->nullable();
                $table->decimal('allowed_km', 18, 2)->nullable();
                $table->decimal('excess_km_rate', 18, 2)->nullable();
                $table->decimal('deposit_amount', 18, 2)->nullable();
                $table->boolean('insurance_included')->default(false);
                $table->boolean('maintenance_included')->default(false);
                $table->timestamp('activation_date')->nullable();
                $table->timestamp('closure_date')->nullable();
                $table->timestamp('signed_at')->nullable();
                $table->string('terminated_reason', 255)->nullable();
                $table->text('notes')->nullable();
                $table->uuid('created_by')->nullable();
                $table->uuid('approved_by')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (! Schema::hasTable('contract_installments')) {
            Schema::create('contract_installments', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('contract_id')->index();
                $table->integer('installment_number');
                $table->date('due_date');
                $table->decimal('principal_amount', 18, 2)->default(0);
                $table->decimal('interest_amount', 18, 2)->default(0);
                $table->decimal('tax_amount', 18, 2)->default(0);
                $table->decimal('penalty_amount', 18, 2)->default(0);
                $table->decimal('total_due_amount', 18, 2);
                $table->decimal('total_paid_amount', 18, 2)->default(0);
                $table->decimal('balance_amount', 18, 2)->default(0);
                $table->string('installment_status', 30)->default('pending');
                $table->timestamp('invoiced_at')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->timestamps();
                $table->unique(['contract_id', 'installment_number'], 'contract_installments_unique');
                $table->index(['contract_id', 'due_date'], 'contract_installments_due_idx');
            });
        }

        if (! Schema::hasTable('geofences')) {
            Schema::create('geofences', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->string('name', 255);
                $table->string('geofence_type', 30)->default('circle');
                $table->decimal('center_latitude', 10, 7)->nullable();
                $table->decimal('center_longitude', 10, 7)->nullable();
                $table->decimal('radius_meters', 12, 2)->nullable();
                $table->json('polygon_geojson')->nullable();
                $table->boolean('is_active')->default(true)->index();
                $table->uuid('created_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('gps_devices')) {
            Schema::create('gps_devices', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->string('device_imei', 100)->unique();
                $table->string('serial_number', 100)->nullable();
                $table->string('sim_number', 100)->nullable();
                $table->string('provider_name', 255)->nullable();
                $table->string('status', 30)->default('active')->index();
                $table->timestamp('last_seen_at')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('gps_positions')) {
            Schema::create('gps_positions', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('gps_device_id')->index();
                $table->uuid('vehicle_id')->index();
                $table->timestamp('recorded_at')->index();
                $table->decimal('latitude', 10, 7);
                $table->decimal('longitude', 10, 7);
                $table->decimal('speed_kmh', 10, 2)->nullable();
                $table->decimal('heading_degrees', 10, 2)->nullable();
                $table->decimal('altitude_meters', 10, 2)->nullable();
                $table->decimal('odometer_km', 18, 2)->nullable();
                $table->boolean('ignition_on')->default(false);
                $table->decimal('battery_level', 8, 2)->nullable();
                $table->json('raw_payload')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        if (! Schema::hasTable('gps_alerts')) {
            Schema::create('gps_alerts', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('vehicle_id')->index();
                $table->uuid('gps_device_id')->nullable()->index();
                $table->string('alert_type', 80);
                $table->string('severity', 30)->default('medium')->index();
                $table->string('title', 255);
                $table->text('description')->nullable();
                $table->timestamp('triggered_at')->index();
                $table->timestamp('resolved_at')->nullable();
                $table->uuid('resolved_by')->nullable();
                $table->string('status', 30)->default('open')->index();
                $table->json('metadata_json')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        if (! Schema::hasTable('reservations')) {
            Schema::create('reservations', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('reservation_number', 80)->unique();
                $table->uuid('customer_id')->index();
                $table->uuid('vehicle_id')->index();
                $table->string('reservation_type', 30)->default('delivery');
                $table->string('status', 30)->default('pending')->index();
                $table->timestamp('desired_start_at')->index();
                $table->timestamp('desired_end_at')->nullable();
                $table->string('pickup_address', 500)->nullable();
                $table->string('delivery_address', 500)->nullable();
                $table->decimal('delivery_latitude', 10, 7)->nullable();
                $table->decimal('delivery_longitude', 10, 7)->nullable();
                $table->decimal('estimated_price', 18, 2)->nullable();
                $table->text('notes')->nullable();
                $table->uuid('created_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('missions')) {
            Schema::create('missions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->uuid('reservation_id')->nullable()->index();
                $table->uuid('contract_id')->nullable()->index();
                $table->uuid('vehicle_id')->nullable()->index();
                $table->uuid('assigned_user_id')->nullable()->index();
                $table->string('mission_type', 30);
                $table->string('status', 30)->default('planned')->index();
                $table->timestamp('scheduled_start_at')->nullable()->index();
                $table->timestamp('scheduled_end_at')->nullable();
                $table->timestamp('actual_start_at')->nullable();
                $table->timestamp('actual_end_at')->nullable();
                $table->string('origin_address', 500)->nullable();
                $table->string('destination_address', 500)->nullable();
                $table->uuid('customer_signature_file_id')->nullable();
                $table->text('notes')->nullable();
                $table->uuid('created_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('mission_checklist_items')) {
            Schema::create('mission_checklist_items', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('mission_id')->index();
                $table->string('checklist_phase', 30);
                $table->string('item_label', 255);
                $table->string('item_value', 255)->nullable();
                $table->string('item_status', 30)->default('pending')->index();
                $table->string('notes', 500)->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mission_checklist_items');
        Schema::dropIfExists('missions');
        Schema::dropIfExists('reservations');
        Schema::dropIfExists('gps_alerts');
        Schema::dropIfExists('gps_positions');
        Schema::dropIfExists('gps_devices');
        Schema::dropIfExists('geofences');
        Schema::dropIfExists('contract_installments');
        Schema::dropIfExists('contracts');
        Schema::dropIfExists('credit_applications');
    }
};

