<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generated_documents', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->uuid('generated_by_user_id')->nullable()->index();

            $table->string('document_type', 64)->index();   // contract | invoice | quote | other
            $table->string('entity_type', 64)->nullable();  // App\Models\Contract, etc.
            $table->uuid('entity_id')->nullable()->index();

            $table->string('title', 255);
            $table->string('disk', 32)->default('local');
            $table->string('storage_path', 512);
            $table->string('mime_type', 64)->default('application/pdf');
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->char('sha256', 64)->index();
            $table->json('metadata')->nullable();

            $table->timestamps();

            $table->index(['entity_type', 'entity_id']);
            $table->index(['company_id', 'document_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generated_documents');
    }
};
