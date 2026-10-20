<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('website_leads')) {
            return;
        }
        Schema::table('website_leads', function (Blueprint $t) {
            if (! Schema::hasColumn('website_leads', 'quoted_daily_rate')) {
                $t->decimal('quoted_daily_rate', 10, 2)->nullable()->after('message');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('website_leads') || ! Schema::hasColumn('website_leads', 'quoted_daily_rate')) {
            return;
        }
        Schema::table('website_leads', function (Blueprint $t) {
            $t->dropColumn('quoted_daily_rate');
        });
    }
};
