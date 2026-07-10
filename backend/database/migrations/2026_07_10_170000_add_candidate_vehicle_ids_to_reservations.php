<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('reservations') && ! Schema::hasColumn('reservations', 'candidate_vehicle_ids')) {
            Schema::table('reservations', function (Blueprint $table) {
                // Draft "intention" reservations can shortlist several vehicles;
                // the definitive one is chosen at validation time.
                $table->json('candidate_vehicle_ids')->nullable()->after('vehicle_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('reservations') && Schema::hasColumn('reservations', 'candidate_vehicle_ids')) {
            Schema::table('reservations', function (Blueprint $table) {
                $table->dropColumn('candidate_vehicle_ids');
            });
        }
    }
};
