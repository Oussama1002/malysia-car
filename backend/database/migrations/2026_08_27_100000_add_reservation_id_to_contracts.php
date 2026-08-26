<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add `reservation_id` to `contracts` so a contract generated from a
 * reservation carries a direct link back. This is the reliable way to
 * detect "already has a contract" — matching by customer+vehicle broke
 * whenever a vehicle swap happened between the reservation and the
 * contract being cut.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('contracts')) {
            return;
        }
        if (! Schema::hasColumn('contracts', 'reservation_id')) {
            Schema::table('contracts', function (Blueprint $table) {
                $table->uuid('reservation_id')->nullable()->after('vehicle_id');
                $table->index('reservation_id', 'contracts_reservation_id_idx');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('contracts') || ! Schema::hasColumn('contracts', 'reservation_id')) {
            return;
        }
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropIndex('contracts_reservation_id_idx');
            $table->dropColumn('reservation_id');
        });
    }
};
