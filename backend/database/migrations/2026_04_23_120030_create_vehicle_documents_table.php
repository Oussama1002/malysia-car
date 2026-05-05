<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicle_documents')) {
            return;
        }
        Schema::create('vehicle_documents', function (Blueprint $table) {
            $table->id();
            $table->uuid('vehicle_id');
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();

            // assurance | carte_grise | vignette | visite_technique | other
            $table->string('type');
            $table->string('number')->nullable();
            $table->date('issued_at')->nullable();
            $table->date('expires_at')->nullable();

            $table->string('original_filename')->nullable();
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->string('storage_disk')->default('local');
            $table->string('storage_path'); // relative path in disk

            $table->unsignedBigInteger('uploaded_by')->nullable();
            $table->timestamps();

            $table->index(['vehicle_id', 'type']);
            $table->index(['expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_documents');
    }
};

