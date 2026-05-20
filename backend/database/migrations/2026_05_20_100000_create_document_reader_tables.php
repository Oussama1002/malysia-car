<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Softnovation Document Reader — OCR pipeline storage.
 *
 * `reader_documents` holds the original uploaded file metadata together with the
 * link to the underlying `files` row and an optional link to a business entity
 * (client, vehicle, contract, …). `reader_document_extractions` stores the OCR
 * raw text, the auto-parsed fields and, after admin review, the validated data.
 *
 * Auto-save of extracted data is forbidden — only the `validated_data` column
 * is considered authoritative once `status = 'validated'`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('reader_documents')) {
            Schema::create('reader_documents', function (Blueprint $table): void {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('file_id')->nullable()->index();
                $table->string('file_path', 500);
                $table->string('file_name', 255);
                $table->string('mime_type', 120)->nullable();
                $table->unsignedBigInteger('file_size')->default(0);

                // cin | passport | driving_license | vehicle_registration | rental_contract | other
                $table->string('document_type', 40)->default('other')->index();

                // Optional link to a business object
                $table->string('linked_entity_type', 60)->nullable();
                $table->string('linked_entity_id', 36)->nullable();
                $table->index(['linked_entity_type', 'linked_entity_id'], 'reader_docs_entity_idx');

                // pending | processing | extracted | validated | failed
                $table->string('status', 24)->default('pending')->index();
                $table->text('error_message')->nullable();

                $table->uuid('created_by')->nullable()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('reader_document_extractions')) {
            Schema::create('reader_document_extractions', function (Blueprint $table): void {
                $table->uuid('id')->primary();
                $table->uuid('document_id')->index();
                $table->string('provider', 32)->default('tesseract');
                $table->longText('raw_text')->nullable();
                $table->json('extracted_data')->nullable();
                $table->json('validated_data')->nullable();
                $table->decimal('confidence_score', 5, 2)->nullable();

                // draft | reviewed | validated | rejected
                $table->string('status', 24)->default('draft')->index();

                $table->uuid('validated_by')->nullable()->index();
                $table->timestamp('validated_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('reader_document_extractions');
        Schema::dropIfExists('reader_documents');
    }
};
