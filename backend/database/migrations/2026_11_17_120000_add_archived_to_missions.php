<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('missions', function (Blueprint $table) {
            if (! Schema::hasColumn('missions', 'archived_at')) {
                $table->timestamp('archived_at')->nullable()->after('updated_at');
                $table->index(['company_id', 'archived_at']);
            }
            if (! Schema::hasColumn('missions', 'archived_by')) {
                $table->uuid('archived_by')->nullable()->after('archived_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('missions', function (Blueprint $table) {
            if (Schema::hasColumn('missions', 'archived_at')) {
                $table->dropIndex(['company_id', 'archived_at']);
                $table->dropColumn('archived_at');
            }
            if (Schema::hasColumn('missions', 'archived_by')) {
                $table->dropColumn('archived_by');
            }
        });
    }
};
