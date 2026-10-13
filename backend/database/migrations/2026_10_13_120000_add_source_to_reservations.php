<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tag the origin of a reservation so downstream flows (contract wizard,
 * tarif rules) can tell "created from the public landing page" from
 * "typed by an agent in the back-office". Only the website-lead source
 * is allowed to carry a tarif forward; everything else forces the agent
 * to re-enter the price.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('reservations')) {
            return;
        }
        Schema::table('reservations', function (Blueprint $table) {
            if (!Schema::hasColumn('reservations', 'source')) {
                $table->string('source', 32)->nullable()->default(null)->after('status');
                $table->index('source', 'reservations_source_idx');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('reservations')) {
            return;
        }
        Schema::table('reservations', function (Blueprint $table) {
            if (Schema::hasColumn('reservations', 'source')) {
                try { $table->dropIndex('reservations_source_idx'); } catch (\Throwable) {}
                $table->dropColumn('source');
            }
        });
    }
};
