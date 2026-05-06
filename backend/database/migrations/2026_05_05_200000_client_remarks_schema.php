<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicles')) {
            Schema::table('vehicles', function (Blueprint $table): void {
                if (! Schema::hasColumn('vehicles', 'transmission')) {
                    $table->string('transmission', 50)->nullable()->after('fuel_type');
                }
                if (! Schema::hasColumn('vehicles', 'brand_name')) {
                    $table->string('brand_name', 120)->nullable()->after('model_id');
                }
                if (! Schema::hasColumn('vehicles', 'model_name')) {
                    $table->string('model_name', 120)->nullable()->after('brand_name');
                }
                if (! Schema::hasColumn('vehicles', 'chassis_number')) {
                    $table->string('chassis_number', 100)->nullable()->after('vin');
                }
                if (! Schema::hasColumn('vehicles', 'ownership_status')) {
                    $table->string('ownership_status', 30)->default('owned')->index();
                }
                if (! Schema::hasColumn('vehicles', 'physical_status')) {
                    $table->string('physical_status', 30)->default('good')->index();
                }
                if (! Schema::hasColumn('vehicles', 'current_location')) {
                    $table->string('current_location', 500)->nullable();
                }
                if (! Schema::hasColumn('vehicles', 'current_reservation_id')) {
                    $table->uuid('current_reservation_id')->nullable()->index();
                }
                if (! Schema::hasColumn('vehicles', 'unavailability_reason')) {
                    $table->string('unavailability_reason', 255)->nullable();
                }
            });
        }

        if (Schema::hasTable('reservations')) {
            Schema::table('reservations', function (Blueprint $table): void {
                if (! Schema::hasColumn('reservations', 'payment_method')) {
                    $table->string('payment_method', 40)->nullable()->after('estimated_price');
                }
                if (! Schema::hasColumn('reservations', 'pickup_location')) {
                    $table->string('pickup_location', 500)->nullable();
                }
                if (! Schema::hasColumn('reservations', 'return_location')) {
                    $table->string('return_location', 500)->nullable();
                }
            });
        }

        if (Schema::hasTable('contracts')) {
            Schema::table('contracts', function (Blueprint $table): void {
                if (! Schema::hasColumn('contracts', 'payment_method')) {
                    $table->string('payment_method', 40)->nullable()->after('deposit_amount');
                }
                if (! Schema::hasColumn('contracts', 'payment_terms')) {
                    $table->text('payment_terms')->nullable();
                }
                if (! Schema::hasColumn('contracts', 'bank_reference')) {
                    $table->string('bank_reference', 120)->nullable();
                }
                if (! Schema::hasColumn('contracts', 'cheque_number')) {
                    $table->string('cheque_number', 80)->nullable();
                }
                if (! Schema::hasColumn('contracts', 'expected_payment_day')) {
                    $table->unsignedTinyInteger('expected_payment_day')->nullable();
                }
            });
        }

        if (Schema::hasTable('vehicle_maintenance_events')) {
            Schema::table('vehicle_maintenance_events', function (Blueprint $table): void {
                if (! Schema::hasColumn('vehicle_maintenance_events', 'lifecycle_status')) {
                    $table->string('lifecycle_status', 30)->nullable()->index();
                }
                if (! Schema::hasColumn('vehicle_maintenance_events', 'started_at')) {
                    $table->timestamp('started_at')->nullable();
                }
                if (! Schema::hasColumn('vehicle_maintenance_events', 'completed_at')) {
                    $table->timestamp('completed_at')->nullable();
                }
            });
        }

        if (! Schema::hasTable('fixed_charges')) {
            Schema::create('fixed_charges', function (Blueprint $table): void {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('name');
                $table->string('category', 80)->index();
                $table->decimal('amount', 14, 2);
                $table->string('currency_code', 3)->default('MAD');
                $table->string('frequency', 20)->index();
                $table->date('start_date');
                $table->date('end_date')->nullable();
                $table->date('next_due_date')->nullable()->index();
                $table->string('payment_method', 40)->nullable();
                $table->string('supplier_name', 255)->nullable();
                $table->uuid('accounting_account_id')->nullable()->index();
                $table->string('status', 20)->default('active')->index();
                $table->text('notes')->nullable();
                $table->uuid('created_by')->nullable();
                $table->timestamps();

                $table->foreign('accounting_account_id')->references('id')->on('accounting_accounts')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('fixed_charge_payments')) {
            Schema::create('fixed_charge_payments', function (Blueprint $table): void {
                $table->uuid('id')->primary();
                $table->uuid('fixed_charge_id')->index();
                $table->date('due_date')->index();
                $table->timestamp('paid_at')->nullable();
                $table->decimal('amount', 14, 2);
                $table->string('payment_method', 40)->nullable();
                $table->string('status', 20)->default('pending')->index();
                $table->uuid('invoice_file_id')->nullable();
                $table->uuid('accounting_entry_id')->nullable()->index();
                $table->timestamps();

                $table->foreign('fixed_charge_id')->references('id')->on('fixed_charges')->cascadeOnDelete();
                $table->foreign('accounting_entry_id')->references('id')->on('accounting_entries')->nullOnDelete();
            });
        }

        if (! Schema::hasTable('vehicle_movements')) {
            Schema::create('vehicle_movements', function (Blueprint $table): void {
                $table->uuid('id')->primary();
                $table->uuid('vehicle_id')->index();
                $table->string('movement_type', 40)->index();
                $table->string('related_type', 80)->nullable();
                $table->string('related_id', 36)->nullable();
                $table->uuid('branch_from_id')->nullable()->index();
                $table->uuid('branch_to_id')->nullable()->index();
                $table->uuid('customer_id')->nullable()->index();
                $table->decimal('odometer_km', 12, 2)->nullable();
                $table->decimal('fuel_level', 5, 2)->nullable();
                $table->text('condition_notes')->nullable();
                $table->uuid('performed_by')->nullable();
                $table->timestamp('performed_at')->index();
                $table->uuid('signature_file_id')->nullable();
                $table->uuid('report_file_id')->nullable();
                $table->timestamps();

                $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
            });
        }

        if (! Schema::hasTable('supplier_agencies')) {
            Schema::create('supplier_agencies', function (Blueprint $table): void {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->string('name');
                $table->string('phone', 40)->nullable();
                $table->string('email')->nullable();
                $table->string('address', 500)->nullable();
                $table->string('contact_person', 120)->nullable();
                $table->string('status', 20)->default('active')->index();
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('sub_rental_contracts')) {
            Schema::create('sub_rental_contracts', function (Blueprint $table): void {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('supplier_agency_id')->index();
                $table->uuid('vehicle_id')->nullable()->index();
                $table->json('external_vehicle_identity')->nullable();
                $table->date('start_date');
                $table->date('end_date')->nullable();
                $table->decimal('daily_cost', 14, 2)->nullable();
                $table->decimal('total_cost', 14, 2)->nullable();
                $table->decimal('deposit_amount', 14, 2)->nullable();
                $table->string('payment_method', 40)->nullable();
                $table->string('status', 20)->default('draft')->index();
                $table->uuid('supplier_contract_file_id')->nullable();
                $table->text('notes')->nullable();
                $table->uuid('created_by')->nullable();
                $table->timestamps();

                $table->foreign('supplier_agency_id')->references('id')->on('supplier_agencies')->cascadeOnDelete();
                $table->foreign('vehicle_id')->references('id')->on('vehicles')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sub_rental_contracts');
        Schema::dropIfExists('supplier_agencies');
        Schema::dropIfExists('vehicle_movements');
        Schema::dropIfExists('fixed_charge_payments');
        Schema::dropIfExists('fixed_charges');

        if (Schema::hasTable('vehicle_maintenance_events')) {
            Schema::table('vehicle_maintenance_events', function (Blueprint $table): void {
                foreach (['lifecycle_status', 'started_at', 'completed_at'] as $col) {
                    if (Schema::hasColumn('vehicle_maintenance_events', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }

        if (Schema::hasTable('contracts')) {
            Schema::table('contracts', function (Blueprint $table): void {
                foreach (['payment_method', 'payment_terms', 'bank_reference', 'cheque_number', 'expected_payment_day'] as $col) {
                    if (Schema::hasColumn('contracts', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }

        if (Schema::hasTable('reservations')) {
            Schema::table('reservations', function (Blueprint $table): void {
                foreach (['payment_method', 'pickup_location', 'return_location'] as $col) {
                    if (Schema::hasColumn('reservations', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }

        if (Schema::hasTable('vehicles')) {
            Schema::table('vehicles', function (Blueprint $table): void {
                foreach ([
                    'transmission', 'brand_name', 'model_name', 'chassis_number',
                    'ownership_status', 'physical_status', 'current_location',
                    'current_reservation_id', 'unavailability_reason',
                ] as $col) {
                    if (Schema::hasColumn('vehicles', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }
    }
};
