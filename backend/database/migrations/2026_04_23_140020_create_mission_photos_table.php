<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('mission_photos')) {
            return;
        }

        Schema::create('mission_photos', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('mission_id');
            $table->string('phase')->nullable(); // pickup, delivery, return, ...
            $table->string('label')->nullable();

            $table->string('original_filename')->nullable();
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->string('storage_disk')->default('local');
            $table->string('storage_path');

            $table->uuid('uploaded_by')->nullable();
            $table->timestamps();

            $table->index(['mission_id', 'created_at']);
            $table->foreign('mission_id')->references('id')->on('missions')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mission_photos');
    }
};

