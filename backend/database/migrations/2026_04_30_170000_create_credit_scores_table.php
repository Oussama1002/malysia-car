<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('credit_scores')) {
            Schema::create('credit_scores', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('credit_application_id')->index();
                $table->uuid('customer_id')->index();
                $table->decimal('score', 6, 2);
                $table->char('risk_band', 1)->index(); // A|B|C|D
                $table->string('recommendation', 80);
                $table->json('factors_positive')->nullable();
                $table->json('factors_negative')->nullable();
                $table->json('breakdown')->nullable();
                $table->uuid('scored_by')->nullable();
                $table->timestamp('scored_at')->useCurrent();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_scores');
    }
};
