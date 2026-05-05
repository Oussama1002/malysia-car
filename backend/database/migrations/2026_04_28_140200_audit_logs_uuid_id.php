<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `audit_logs.id` was an auto-increment bigint, but the AuditLog model uses
 * HasUuids and writes UUID v7 values. Convert the column to char(36).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (\DB::getDriverName() === 'sqlite') {
            return;
        }
        // Strip auto-increment + primary key in one statement (MySQL requires it).
        \DB::statement('ALTER TABLE `audit_logs` MODIFY `id` BIGINT UNSIGNED NOT NULL, DROP PRIMARY KEY');
        \DB::statement('ALTER TABLE `audit_logs` MODIFY `id` CHAR(36) NOT NULL');
        \DB::statement('ALTER TABLE `audit_logs` ADD PRIMARY KEY (`id`)');
    }

    public function down(): void
    {
        // Lossy: existing UUIDs cannot be coerced back to bigint.
    }
};
