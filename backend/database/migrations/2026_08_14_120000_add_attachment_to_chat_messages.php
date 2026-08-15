<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            if (! Schema::hasColumn('chat_messages', 'attachment_file_id')) {
                $table->uuid('attachment_file_id')->nullable()->after('body');
            }
        });

        // A message can be attachment-only, so body must allow null.
        if (Schema::hasColumn('chat_messages', 'body')) {
            try {
                DB::statement('ALTER TABLE chat_messages MODIFY body TEXT NULL');
            } catch (\Throwable) {
                // Non-MySQL / already nullable — ignore.
            }
        }
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            if (Schema::hasColumn('chat_messages', 'attachment_file_id')) {
                $table->dropColumn('attachment_file_id');
            }
        });
    }
};
