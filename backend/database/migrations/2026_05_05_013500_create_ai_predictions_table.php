<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('ai_predictions')) {
            return;
        }

        Schema::create('ai_predictions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->uuid('branch_id')->nullable()->index();
            $table->string('prediction_type', 80)->index();
            $table->string('entity_type', 80)->nullable()->index();
            $table->uuid('entity_id')->nullable()->index();
            $table->decimal('score', 8, 2)->nullable();
            $table->string('risk_level', 30)->nullable()->index();
            $table->string('model_mode', 30)->default('rule_based');
            $table->string('provider', 80)->nullable();
            $table->text('summary')->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('predicted_at')->useCurrent()->index();
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->index(['prediction_type', 'entity_type', 'entity_id'], 'ai_predictions_lookup_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_predictions');
    }
};
