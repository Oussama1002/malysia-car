<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Central `files` repository (document center). Required before `entity_attachments`
 * foreign key to `files.id` (see 2026_05_01_160000_extend_entity_attachments_document_center).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('files')) {
            return;
        }

        Schema::create('files', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->uuid('branch_id')->nullable()->index();
            $table->string('original_name', 255);
            $table->string('stored_name', 255);
            $table->string('storage_disk', 32)->default('local');
            $table->string('storage_path', 500);
            $table->string('mime_type', 120)->nullable();
            $table->string('extension', 20)->nullable();
            $table->unsignedBigInteger('file_size')->default(0);
            $table->string('checksum_sha256', 64)->nullable()->index();
            $table->uuid('uploaded_by')->nullable()->index();
            $table->boolean('is_public')->default(false);
            $table->timestamp('created_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('files');
    }
};
