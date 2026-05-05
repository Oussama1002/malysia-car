<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('contract_histories')) {
            return;
        }

        Schema::create('contract_histories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('contract_id');
            $table->foreign('contract_id')->references('id')->on('contracts')->cascadeOnDelete();

            $table->string('action'); // created, approved, activated, terminated, updated, schedule_generated, ...
            $table->string('from_status')->nullable();
            $table->string('to_status')->nullable();
            $table->string('note')->nullable();
            $table->uuid('actor_id')->nullable();
            $table->timestamp('at')->useCurrent();

            $table->timestamps();

            $table->index(['contract_id', 'at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_histories');
    }
};

