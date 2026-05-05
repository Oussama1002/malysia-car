<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 10 — Invoicing, payments, treasury.
 *
 * Creates:
 *   - invoices / invoice_lines
 *   - payments / payment_allocations
 *   - bank_accounts / bank_transactions
 *
 * Schema-aware idempotent creates (dual-DB).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('invoices')) {
            Schema::create('invoices', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('invoice_number', 60);
                $table->unique(['company_id', 'invoice_number'], 'invoices_company_invoice_number_unique');
                $table->string('invoice_type', 40)->default('contract'); // contract, sale, service, credit_note
                $table->uuid('customer_id')->index();
                $table->uuid('contract_id')->nullable()->index();
                $table->uuid('sale_id')->nullable()->index(); // links used-car sales
                $table->date('issue_date');
                $table->date('due_date');
                $table->string('currency_code', 3)->default('MAD');
                $table->decimal('subtotal_amount', 18, 2)->default(0);
                $table->decimal('tax_amount', 18, 2)->default(0);
                $table->decimal('discount_amount', 18, 2)->default(0);
                $table->decimal('total_amount', 18, 2)->default(0);
                $table->decimal('amount_paid', 18, 2)->default(0);
                $table->decimal('amount_due', 18, 2)->default(0);
                $table->string('status', 30)->default('draft'); // draft, issued, partial, paid, overdue, cancelled
                $table->timestamp('issued_at')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->text('notes')->nullable();
                $table->uuid('created_by')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (! Schema::hasTable('invoice_lines')) {
            Schema::create('invoice_lines', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('invoice_id')->index();
                $table->integer('position')->default(1);
                $table->string('line_type', 40)->default('installment'); // installment, fee, penalty, sale, adjustment
                $table->uuid('contract_installment_id')->nullable()->index();
                $table->string('description', 500);
                $table->decimal('quantity', 10, 2)->default(1);
                $table->decimal('unit_price', 18, 2);
                $table->decimal('discount_amount', 18, 2)->default(0);
                $table->decimal('tax_rate', 5, 2)->default(0); // %
                $table->decimal('tax_amount', 18, 2)->default(0);
                $table->decimal('line_total', 18, 2);
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('payments')) {
            Schema::create('payments', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('payment_number', 60)->unique();
                $table->uuid('customer_id')->index();
                $table->string('payment_method', 50); // cash, bank_transfer, check, card, compensation
                $table->string('payment_direction', 20)->default('incoming'); // incoming, outgoing (refunds)
                $table->decimal('amount', 18, 2);
                $table->string('currency_code', 3)->default('MAD');
                $table->decimal('amount_allocated', 18, 2)->default(0);
                $table->decimal('amount_unallocated', 18, 2)->default(0);
                $table->string('status', 30)->default('received'); // received, allocated, refunded, reversed
                $table->date('payment_date');
                $table->uuid('bank_account_id')->nullable()->index();
                $table->string('external_reference', 120)->nullable(); // TRX ID, check #
                $table->string('check_number', 60)->nullable();
                $table->date('check_date')->nullable();
                $table->string('check_bank', 120)->nullable();
                $table->text('notes')->nullable();
                $table->uuid('received_by_user_id')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (! Schema::hasTable('payment_allocations')) {
            Schema::create('payment_allocations', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('payment_id')->index();
                $table->uuid('invoice_id')->nullable()->index();
                $table->uuid('contract_installment_id')->nullable()->index();
                $table->decimal('amount_allocated', 18, 2);
                $table->timestamp('allocated_at');
                $table->uuid('allocated_by_user_id')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('bank_accounts')) {
            Schema::create('bank_accounts', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('account_name', 150);
                $table->string('bank_name', 150);
                $table->string('account_number', 60)->nullable();
                $table->string('iban', 60)->nullable();
                $table->string('swift_code', 30)->nullable();
                $table->string('currency_code', 3)->default('MAD');
                $table->decimal('opening_balance', 18, 2)->default(0);
                $table->decimal('current_balance', 18, 2)->default(0);
                $table->boolean('is_active')->default(true);
                $table->boolean('is_primary')->default(false);
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (! Schema::hasTable('bank_transactions')) {
            Schema::create('bank_transactions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('bank_account_id')->index();
                $table->string('transaction_type', 30); // debit, credit
                $table->decimal('amount', 18, 2);
                $table->string('currency_code', 3)->default('MAD');
                $table->date('value_date');
                $table->date('posted_date')->nullable();
                $table->string('description', 500)->nullable();
                $table->string('external_reference', 120)->nullable();
                $table->string('counterparty_name', 255)->nullable();
                $table->string('counterparty_iban', 60)->nullable();
                $table->uuid('matched_payment_id')->nullable()->index();
                $table->string('reconciliation_status', 30)->default('unmatched'); // unmatched, matched, ignored
                $table->string('import_batch_id', 80)->nullable()->index();
                $table->json('raw_payload')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_transactions');
        Schema::dropIfExists('bank_accounts');
        Schema::dropIfExists('payment_allocations');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('invoice_lines');
        Schema::dropIfExists('invoices');
    }
};
