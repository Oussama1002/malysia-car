<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── taxes ─────────────────────────────────────────────────────────────
        if (! Schema::hasTable('taxes')) {
            Schema::create('taxes', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('code', 30)->unique();
                $table->string('name', 120);
                $table->decimal('rate', 7, 4)->default(0); // e.g. 20.0000
                $table->enum('tax_type', ['vat', 'withholding', 'stamp', 'other'])->default('vat');
                $table->string('applies_to', 80)->nullable(); // product, service, all
                $table->boolean('is_active')->default(true);
                $table->string('account_code', 20)->nullable(); // linked account code
                $table->timestamps();
            });
        }

        // ── fiscal years ───────────────────────────────────────────────────────
        if (! Schema::hasTable('fiscal_years')) {
            Schema::create('fiscal_years', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->string('code', 20)->unique();
                $table->date('start_date');
                $table->date('end_date');
                $table->enum('status', ['open', 'closed', 'locked'])->default('open');
                $table->timestamp('closed_at')->nullable();
                $table->uuid('closed_by_user_id')->nullable();
                $table->timestamps();
            });
        }

        // ── fiscal periods ─────────────────────────────────────────────────────
        if (! Schema::hasTable('fiscal_periods')) {
            Schema::create('fiscal_periods', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('fiscal_year_id')->index();
                $table->unsignedSmallInteger('period_number');
                $table->date('start_date');
                $table->date('end_date');
                $table->enum('status', ['open', 'closed'])->default('open');
                $table->timestamp('closed_at')->nullable();
                $table->timestamps();
            });
        }

        // ── accounting accounts (plan comptable) ───────────────────────────────
        if (! Schema::hasTable('accounting_accounts')) {
            Schema::create('accounting_accounts', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->string('code', 30)->unique();
                $table->string('name', 160);
                $table->enum('account_type', ['asset', 'liability', 'equity', 'income', 'expense', 'contra'])->default('asset');
                $table->enum('normal_balance', ['debit', 'credit'])->default('debit');
                $table->string('parent_code', 30)->nullable(); // parent account code
                $table->boolean('is_detail')->default(true);   // false = group account
                $table->boolean('is_active')->default(true);
                $table->boolean('allow_direct_posting')->default(true);
                $table->decimal('opening_balance', 15, 2)->default(0);
                $table->decimal('current_balance', 15, 2)->default(0);
                $table->string('currency_code', 3)->default('MAD');
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        // ── accounting journals ────────────────────────────────────────────────
        if (! Schema::hasTable('accounting_journals')) {
            Schema::create('accounting_journals', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->string('code', 20)->unique();
                $table->string('name', 120);
                $table->enum('journal_type', ['sales', 'purchases', 'cash', 'bank', 'general', 'payroll', 'stock'])->default('general');
                $table->string('default_account_code', 30)->nullable();
                $table->boolean('is_default')->default(false);
                $table->boolean('is_active')->default(true);
                $table->string('sequence_prefix', 10)->nullable();
                $table->unsignedInteger('sequence_next')->default(1);
                $table->timestamps();
            });
        }

        // ── journal entries ────────────────────────────────────────────────────
        if (! Schema::hasTable('accounting_entries')) {
            Schema::create('accounting_entries', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->uuid('branch_id')->nullable();
                $table->uuid('journal_id')->index();
                $table->uuid('fiscal_period_id')->index()->nullable();
                $table->string('entry_number', 40)->unique();
                $table->date('entry_date');
                $table->text('description');
                $table->string('reference', 120)->nullable();
                $table->enum('status', ['draft', 'posted', 'cancelled'])->default('draft');
                // source link (polymorphic-style)
                $table->string('source_type', 40)->nullable(); // invoice, payment, depreciation, asset, manual
                $table->uuid('source_id')->nullable();
                $table->string('currency_code', 3)->default('MAD');
                $table->decimal('total_debit', 15, 2)->default(0);
                $table->decimal('total_credit', 15, 2)->default(0);
                $table->timestamp('posted_at')->nullable();
                $table->uuid('posted_by_user_id')->nullable();
                $table->uuid('created_by_user_id')->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->index(['source_type', 'source_id']);
                $table->index('entry_date');
            });
        }

        // ── journal entry lines ────────────────────────────────────────────────
        if (! Schema::hasTable('accounting_entry_lines')) {
            Schema::create('accounting_entry_lines', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('entry_id')->index();
                $table->string('account_code', 30)->index();
                $table->uuid('account_id')->nullable()->index();
                $table->unsignedSmallInteger('line_order')->default(1);
                $table->text('label');
                $table->decimal('debit', 15, 2)->default(0);
                $table->decimal('credit', 15, 2)->default(0);
                $table->string('currency_code', 3)->default('MAD');
                // optional: tax
                $table->uuid('tax_id')->nullable();
                $table->decimal('tax_amount', 12, 2)->nullable();
                // optional: third party tracking
                $table->string('third_party_type', 30)->nullable(); // customer, supplier
                $table->uuid('third_party_id')->nullable();
                // analytical dimensions
                $table->uuid('branch_id')->nullable();
                $table->string('cost_center', 60)->nullable();
                $table->timestamps();
            });
        }

        // ── fixed assets ───────────────────────────────────────────────────────
        if (! Schema::hasTable('fixed_assets')) {
            Schema::create('fixed_assets', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->string('asset_number', 40)->unique();
                $table->string('name', 160);
                $table->enum('category', ['vehicle', 'equipment', 'furniture', 'building', 'intangible', 'other'])->default('other');
                $table->uuid('vehicle_id')->nullable(); // link to fleet
                $table->date('acquisition_date');
                $table->decimal('acquisition_cost', 15, 2)->default(0);
                $table->decimal('residual_value', 15, 2)->default(0);
                $table->unsignedSmallInteger('useful_life_months')->default(60);
                $table->enum('depreciation_method', ['linear', 'declining', 'none'])->default('linear');
                $table->decimal('accumulated_depreciation', 15, 2)->default(0);
                $table->decimal('book_value', 15, 2)->default(0); // acquisition_cost - accumulated_depreciation
                $table->string('asset_account_code', 30)->nullable();
                $table->string('depreciation_account_code', 30)->nullable();
                $table->string('accumulated_dep_account_code', 30)->nullable();
                $table->enum('status', ['active', 'disposed', 'impaired'])->default('active');
                $table->date('disposal_date')->nullable();
                $table->decimal('disposal_amount', 15, 2)->nullable();
                $table->uuid('disposal_entry_id')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        // ── depreciation lines ─────────────────────────────────────────────────
        if (! Schema::hasTable('depreciation_lines')) {
            Schema::create('depreciation_lines', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('asset_id')->index();
                $table->uuid('fiscal_period_id')->nullable();
                $table->date('period_date'); // last day of period
                $table->decimal('amount', 12, 2)->default(0);
                $table->decimal('cumulative_depreciation', 12, 2)->default(0);
                $table->decimal('book_value', 12, 2)->default(0);
                $table->boolean('is_posted')->default(false);
                $table->uuid('entry_id')->nullable(); // accounting entry created
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('depreciation_lines');
        Schema::dropIfExists('fixed_assets');
        Schema::dropIfExists('accounting_entry_lines');
        Schema::dropIfExists('accounting_entries');
        Schema::dropIfExists('accounting_journals');
        Schema::dropIfExists('accounting_accounts');
        Schema::dropIfExists('fiscal_periods');
        Schema::dropIfExists('fiscal_years');
        Schema::dropIfExists('taxes');
    }
};
