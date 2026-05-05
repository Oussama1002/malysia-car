<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accident_documents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('accident_id')->index();
            $table->foreign('accident_id')->references('id')->on('vehicle_accidents')->cascadeOnDelete();
            $table->string('type', 30); // photo, rapport, assurance, expertise, constat
            $table->string('filename', 255);
            $table->string('disk', 30)->default('local');
            $table->string('path', 500);
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->string('mime_type', 100)->nullable();
            $table->char('uploaded_by', 36)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accident_documents');
    }
};
