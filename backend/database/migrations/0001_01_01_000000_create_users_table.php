<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * - **SQLite (local dev, no import):** create a minimal Laravel `users` table for Sanctum / seeders.
     * - **MySQL:** assume `users` and related tables come from `driveflow_db.sql`; only add Laravel’s `sessions` and
     *   optionally Laravel-style `password_reset_tokens` if missing (your dump may define a different `password_reset_tokens` shape).
     */
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'sqlite' && ! Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('name');
                $table->string('email')->unique();
                $table->timestamp('email_verified_at')->nullable();
                $table->string('password');
                $table->string('role', 32)->index();
                $table->string('avatar', 500)->nullable();
                $table->rememberToken();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('password_reset_tokens')) {
            Schema::create('password_reset_tokens', function (Blueprint $table) {
                $table->string('email')->primary();
                $table->string('token');
                $table->timestamp('created_at')->nullable();
            });
        }

        if (! Schema::hasTable('sessions')) {
            Schema::create('sessions', function (Blueprint $table) use ($driver) {
                $table->string('id')->primary();
                if ($driver === 'mysql' || $driver === 'mariadb') {
                    $table->string('user_id', 36)->nullable()->index();
                } else {
                    $table->uuid('user_id')->nullable()->index();
                }
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->longText('payload');
                $table->integer('last_activity')->index();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            Schema::dropIfExists('users');
            Schema::dropIfExists('password_reset_tokens');
        }
    }
};
