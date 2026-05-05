<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 9 — Used-car (VO) listings, valuations, sales and ownership transfers.
 * Idempotent creates so the migration is safe on SQLite dev and MySQL prod.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('used_car_listings')) {
            Schema::create('used_car_listings', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('vehicle_id')->index();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('listing_code', 50)->unique();
                $table->string('stage', 30)->default('draft'); // draft, evaluated, published, reserved, sold, cancelled
                $table->string('publication_channel', 80)->nullable(); // web, showroom, marketplace…
                $table->decimal('asking_price', 18, 2)->nullable();
                $table->decimal('min_acceptable_price', 18, 2)->nullable();
                $table->decimal('estimated_value', 18, 2)->nullable();
                $table->decimal('valuation_score', 6, 2)->nullable(); // 0..100
                $table->integer('inspection_score')->nullable();
                $table->json('inspection_notes')->nullable();
                $table->integer('mileage_at_listing')->nullable();
                $table->timestamp('published_at')->nullable();
                $table->timestamp('reserved_at')->nullable();
                $table->uuid('reserved_by_customer_id')->nullable()->index();
                $table->timestamp('reserved_until')->nullable();
                $table->timestamp('sold_at')->nullable();
                $table->uuid('sold_to_customer_id')->nullable()->index();
                $table->decimal('final_sale_price', 18, 2)->nullable();
                $table->string('currency_code', 3)->default('MAD');
                $table->text('notes')->nullable();
                $table->uuid('created_by')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (! Schema::hasTable('used_car_valuations')) {
            Schema::create('used_car_valuations', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('listing_id')->index();
                $table->string('method', 60); // expert, argus, comparable, automated
                $table->decimal('market_value', 18, 2)->nullable();
                $table->decimal('trade_in_value', 18, 2)->nullable();
                $table->decimal('suggested_price', 18, 2)->nullable();
                $table->decimal('condition_score', 6, 2)->nullable();
                $table->integer('mileage')->nullable();
                $table->json('factors')->nullable(); // {age, mileage, condition, demand}
                $table->text('notes')->nullable();
                $table->uuid('valued_by_user_id')->nullable();
                $table->timestamp('valued_at');
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('used_car_sales')) {
            Schema::create('used_car_sales', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('listing_id')->index();
                $table->uuid('vehicle_id')->index();
                $table->uuid('buyer_customer_id')->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('sale_number', 60)->unique();
                $table->decimal('sale_price', 18, 2);
                $table->decimal('discount_amount', 18, 2)->default(0);
                $table->decimal('tax_amount', 18, 2)->default(0);
                $table->decimal('total_amount', 18, 2);
                $table->string('currency_code', 3)->default('MAD');
                $table->string('payment_method', 50)->nullable(); // cash, bank_transfer, check, financed
                $table->string('payment_status', 30)->default('pending'); // pending, partial, paid
                $table->decimal('amount_paid', 18, 2)->default(0);
                $table->timestamp('sale_date');
                $table->uuid('invoice_id')->nullable()->index();
                $table->uuid('contract_id')->nullable()->index(); // when financed
                $table->text('notes')->nullable();
                $table->uuid('closed_by_user_id')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('vehicle_ownership_transfers')) {
            Schema::create('vehicle_ownership_transfers', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('vehicle_id')->index();
                $table->uuid('sale_id')->nullable()->index();
                $table->uuid('from_company_id')->nullable();
                $table->uuid('to_customer_id')->nullable();
                $table->string('transfer_type', 40)->default('sale'); // sale, lease_buyout, scrap, return
                $table->string('transfer_status', 30)->default('initiated'); // initiated, docs_submitted, stamped, completed, failed
                $table->date('transfer_date')->nullable();
                $table->string('admin_reference', 120)->nullable();
                $table->json('documents')->nullable();
                $table->text('notes')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_ownership_transfers');
        Schema::dropIfExists('used_car_sales');
        Schema::dropIfExists('used_car_valuations');
        Schema::dropIfExists('used_car_listings');
    }
};
