<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('chat_messages')) {
            return;
        }

        if (! Schema::hasColumn('chat_messages', 'attachment_duration')) {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->unsignedSmallInteger('attachment_duration')->nullable();
            });
        }

        try {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->text('body')->nullable()->change();
            });
        } catch (\Throwable) {
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('chat_messages') && Schema::hasColumn('chat_messages', 'attachment_duration')) {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->dropColumn('attachment_duration');
            });
        }
    }
};
