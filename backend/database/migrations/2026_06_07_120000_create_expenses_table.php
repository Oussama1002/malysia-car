<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable();
            $table->uuid('branch_id')->nullable();

            // Core fields
            $table->string('label');
            $table->decimal('amount', 12, 2);
            $table->string('currency_code', 3)->default('MAD');
            $table->date('expense_date');
            $table->date('due_date')->nullable();
            $table->string('category', 50)->default('autres');
            $table->string('expense_type', 20)->default('operational'); // fixed, operational, one_time
            $table->string('status', 20)->default('unpaid'); // paid, unpaid, overdue
            $table->string('payment_method', 40)->nullable();
            $table->string('reference')->nullable(); // invoice number, receipt ref

            // Links — operational context
            $table->uuid('vehicle_id')->nullable();
            $table->uuid('driver_id')->nullable(); // user ID of driver
            $table->uuid('customer_id')->nullable();
            $table->uuid('contract_id')->nullable();
            $table->uuid('reservation_id')->nullable();
            $table->uuid('mission_id')->nullable();
            $table->uuid('supplier_id')->nullable();

            // Recurring support
            $table->string('frequency', 20)->nullable(); // monthly, quarterly, yearly
            $table->uuid('recurring_parent_id')->nullable(); // links to parent recurring expense

            // Meta
            $table->text('notes')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            // Indexes
            $table->index(['company_id', 'expense_date']);
            $table->index(['vehicle_id', 'expense_date']);
            $table->index(['customer_id']);
            $table->index(['supplier_id']);
            $table->index(['category']);
            $table->index(['status']);
            $table->index(['expense_type']);
        });

        Schema::create('expense_suppliers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable();
            $table->string('name');
            $table->string('category', 50)->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('ice', 30)->nullable(); // Moroccan tax ID
            $table->string('status', 20)->default('active');
            $table->timestamps();

            $table->index(['company_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('expense_suppliers');
    }
};
