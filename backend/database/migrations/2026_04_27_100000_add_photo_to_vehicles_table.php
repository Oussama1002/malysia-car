<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('vehicles') || Schema::hasColumn('vehicles', 'photo_file_id')) {
            return;
        }
        Schema::table('vehicles', function (Blueprint $table) {
            $table->char('photo_file_id', 36)->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn('photo_file_id');
        });
    }
};
