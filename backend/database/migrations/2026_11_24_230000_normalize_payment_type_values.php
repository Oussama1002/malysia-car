<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * QA 2026-11-24 found three competing naming conventions in payments.payment_type:
 *   rent (English) / down_payment (English) / paiement_location (French) / caution / NULL.
 * The UI only maps the French forms, so English rows render raw. Normalize to one
 * French vocabulary so every new label the frontend adds covers everything.
 *
 *   rent         -> paiement_location
 *   down_payment -> acompte
 *   NULL / ''    -> paiement_location  (default for the single stray row)
 *
 * The API contract keeps 'caution' as-is (per AGENTS §5.2); the UI label is the
 * one that renders as "Franchise d'assurance".
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('payments')->where('payment_type', 'rent')->update(['payment_type' => 'paiement_location']);
        DB::table('payments')->where('payment_type', 'down_payment')->update(['payment_type' => 'acompte']);
        DB::table('payments')
            ->where(function ($q) {
                $q->whereNull('payment_type')->orWhere('payment_type', '');
            })
            ->update(['payment_type' => 'paiement_location']);
    }

    public function down(): void
    {
        // Data-only normalization — no rollback (original enum was polluted).
    }
};
