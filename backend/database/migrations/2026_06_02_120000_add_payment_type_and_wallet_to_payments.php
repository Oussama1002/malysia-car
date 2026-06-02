<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add payment_type column and expand payment_method to include 'wallet'.
 *
 * payment_type: avance, paiement_location, solde, caution, penalite, utilisation_avoir
 * payment_method: cash, bank_transfer, check, card, compensation, wallet
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (! Schema::hasColumn('payments', 'payment_type')) {
                $table->string('payment_type', 50)->nullable()->after('payment_method');
            }
            if (! Schema::hasColumn('payments', 'contract_id')) {
                $table->uuid('contract_id')->nullable()->after('customer_id');
            }
            if (! Schema::hasColumn('payments', 'reservation_id')) {
                $table->uuid('reservation_id')->nullable()->after('contract_id');
            }
            if (! Schema::hasColumn('payments', 'invoice_id')) {
                $table->uuid('invoice_id')->nullable()->after('reservation_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            foreach (['payment_type', 'contract_id', 'reservation_id', 'invoice_id'] as $col) {
                if (Schema::hasColumn('payments', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
