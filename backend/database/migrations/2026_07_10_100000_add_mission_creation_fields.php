<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('missions', function (Blueprint $table) {
            if (! Schema::hasColumn('missions', 'priority')) {
                $table->string('priority', 20)->default('normal')->after('status');
            }
            if (! Schema::hasColumn('missions', 'estimated_duration_minutes')) {
                $table->unsignedInteger('estimated_duration_minutes')->nullable()->after('scheduled_end_at');
            }
            if (! Schema::hasColumn('missions', 'client_instructions')) {
                $table->text('client_instructions')->nullable()->after('notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('missions', function (Blueprint $table) {
            foreach (['priority', 'estimated_duration_minutes', 'client_instructions'] as $col) {
                if (Schema::hasColumn('missions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
