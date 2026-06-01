<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One wallet per customer — holds the avoir/credit balance
        Schema::create('customer_wallets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->index();
            $table->uuid('customer_id')->unique();
            $table->decimal('balance', 12, 2)->default(0);
            $table->char('currency_code', 3)->default('MAD');
            $table->timestamps();

            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });

        // Immutable ledger: every credit or debit is a row
        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->index();
            $table->uuid('wallet_id')->index();
            $table->uuid('customer_id')->index();

            // 'credit' = money added to wallet, 'debit' = money removed from wallet
            $table->enum('direction', ['credit', 'debit']);

            // Semantic type for reporting / UI labelling
            $table->string('type', 60); // early_return | manual_credit | manual_debit | reservation_applied | contract_applied

            $table->decimal('amount', 12, 2);          // always positive
            $table->decimal('balance_after', 12, 2);   // wallet balance snapshot after this tx

            // What triggered this transaction
            $table->string('reference_type', 60)->nullable(); // 'contract' | 'reservation' | 'manual'
            $table->uuid('reference_id')->nullable();

            $table->string('description')->nullable();   // human-readable note shown in UI
            $table->text('reason')->nullable();          // required for manual adjustments

            $table->uuid('performed_by')->nullable();    // user who triggered (null = system)
            $table->timestamps();

            $table->foreign('wallet_id')->references('id')->on('customer_wallets')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_transactions');
        Schema::dropIfExists('customer_wallets');
    }
};
