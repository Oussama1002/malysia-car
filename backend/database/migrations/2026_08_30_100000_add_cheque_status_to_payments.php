<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Track the lifecycle of cheque payments: pending (received but not yet
 * deposited/cleared), cleared (encaissé), or bounced (rejeté). Optional
 * timestamp records when it was cashed / bounced.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payments')) {
            return;
        }
        if (! Schema::hasColumn('payments', 'cheque_status')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->string('cheque_status', 20)->nullable()->after('check_bank');
                $table->timestamp('cheque_cashed_at')->nullable()->after('cheque_status');
                $table->string('cheque_bounce_reason', 255)->nullable()->after('cheque_cashed_at');
                $table->index(['payment_method', 'cheque_status'], 'payments_cheque_status_idx');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('payments') || ! Schema::hasColumn('payments', 'cheque_status')) {
            return;
        }
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex('payments_cheque_status_idx');
            $table->dropColumn(['cheque_status', 'cheque_cashed_at', 'cheque_bounce_reason']);
        });
    }
};
