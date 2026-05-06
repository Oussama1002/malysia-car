<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Supplier agencies — external companies/agencies we rent vehicles from
        if (! Schema::hasTable('supplier_agencies')) {
            Schema::create('supplier_agencies', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('name', 191);
                $table->string('contact_person', 191)->nullable();
                $table->string('phone', 30)->nullable();
                $table->string('email', 191)->nullable();
                $table->text('address')->nullable();
                $table->string('city', 100)->nullable();
                $table->string('ice', 50)->nullable();
                $table->string('rc', 50)->nullable();
                $table->string('status', 20)->default('active')->index(); // active, inactive, blacklisted
                $table->text('notes')->nullable();
                $table->uuid('created_by')->nullable()->index();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['company_id', 'status']);
                $table->index(['company_id', 'branch_id']);
            });
        }

        // Sub-rental contracts — tracks the rental agreement with supplier
        if (! Schema::hasTable('sub_rental_contracts')) {
            Schema::create('sub_rental_contracts', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->uuid('supplier_agency_id')->index();
                $table->uuid('vehicle_id')->nullable()->index();
                $table->string('contract_number', 100)->nullable();
                $table->json('external_vehicle_identity')->nullable(); // registration, brand, model, year, color, mileage
                $table->date('start_date')->index();
                $table->date('end_date')->index();
                $table->decimal('daily_cost', 12, 2)->default(0);
                $table->decimal('total_cost', 12, 2)->default(0);
                $table->decimal('deposit_amount', 12, 2)->nullable();
                $table->string('payment_method', 30)->default('cash'); // cash, bank_transfer, cheque, card, other
                $table->string('payment_status', 20)->default('unpaid')->index(); // unpaid, partial, paid
                $table->string('status', 20)->default('draft')->index(); // draft, active, returned, closed, cancelled
                $table->uuid('supplier_contract_file_id')->nullable();
                $table->uuid('return_report_file_id')->nullable();
                $table->text('notes')->nullable();
                $table->uuid('created_by')->nullable()->index();
                $table->uuid('activated_by')->nullable();
                $table->uuid('returned_by')->nullable();
                $table->uuid('closed_by')->nullable();
                $table->timestamp('activated_at')->nullable()->index();
                $table->timestamp('returned_at')->nullable();
                $table->timestamp('closed_at')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['company_id', 'status']);
                $table->index(['company_id', 'branch_id']);
                $table->index(['vehicle_id', 'status']);
                $table->index(['start_date', 'end_date']);
                $table->index(['supplier_agency_id', 'status']);
            });
        }

        // Sub-rental payments — tracks individual payments to supplier
        if (! Schema::hasTable('sub_rental_payments')) {
            Schema::create('sub_rental_payments', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('sub_rental_contract_id')->index();
                $table->decimal('amount', 12, 2);
                $table->string('payment_method', 30)->default('cash');
                $table->date('payment_date')->index();
                $table->string('reference', 100)->nullable();
                $table->text('notes')->nullable();
                $table->uuid('accounting_entry_id')->nullable()->index();
                $table->uuid('created_by')->nullable()->index();
                $table->timestamps();

                $table->index(['sub_rental_contract_id', 'payment_date']);
            });
        }

        // Sub-rental return reports — documents the return of vehicle to supplier
        if (! Schema::hasTable('sub_rental_return_reports')) {
            Schema::create('sub_rental_return_reports', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('sub_rental_contract_id')->unique()->index();
                $table->uuid('vehicle_id')->nullable()->index();
                $table->timestamp('returned_at');
                $table->decimal('odometer_km', 12, 2)->nullable();
                $table->string('fuel_level', 20)->nullable(); // empty, quarter, half, three_quarters, full
                $table->text('condition_notes')->nullable();
                $table->text('damage_notes')->nullable();
                $table->decimal('extra_charges', 12, 2)->nullable();
                $table->string('signed_by_supplier', 191)->nullable();
                $table->uuid('file_id')->nullable();
                $table->uuid('created_by')->nullable()->index();
                $table->timestamps();
            });
        }

        // Add ownership_status to vehicles if not present
        if (Schema::hasTable('vehicles') && ! Schema::hasColumn('vehicles', 'ownership_status')) {
            Schema::table('vehicles', function (Blueprint $table) {
                $table->string('ownership_status', 30)->default('owned')->after('status')->index();
                // owned, leased, sub_rented, loaner
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sub_rental_return_reports');
        Schema::dropIfExists('sub_rental_payments');
        Schema::dropIfExists('sub_rental_contracts');
        Schema::dropIfExists('supplier_agencies');

        if (Schema::hasColumn('vehicles', 'ownership_status')) {
            Schema::table('vehicles', function (Blueprint $table) {
                $table->dropColumn('ownership_status');
            });
        }
    }
};
