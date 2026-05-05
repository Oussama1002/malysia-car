<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicle_status_histories')) {
            return;
        }
        Schema::create('vehicle_status_histories', function (Blueprint $table) {
            $table->id();
            $table->uuid('vehicle_id');
            $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();

            $table->string('status');
            $table->timestamp('started_at')->useCurrent();
            $table->timestamp('ended_at')->nullable();
            $table->string('note')->nullable();
            $table->unsignedBigInteger('set_by')->nullable();

            $table->timestamps();

            $table->index(['vehicle_id', 'started_at']);
            $table->index(['vehicle_id', 'ended_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_status_histories');
    }
};

