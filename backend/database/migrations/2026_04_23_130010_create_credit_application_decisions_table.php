<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('credit_application_decisions')) {
            Schema::create('credit_application_decisions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('credit_application_id');
                $table->foreign('credit_application_id')->references('id')->on('credit_applications')->cascadeOnDelete();

                $table->string('decision'); // pending, approved, rejected
                $table->decimal('score', 6, 2)->nullable();
                $table->string('recommendation')->nullable();
                $table->text('note')->nullable();
                $table->uuid('decided_by')->nullable();
                $table->timestamp('decided_at')->useCurrent();

                $table->timestamps();
            });
        }

        // Ensure index exists (use short name to satisfy MySQL identifier length).
        Schema::table('credit_application_decisions', function (Blueprint $table) {
            $table->index(['credit_application_id', 'decided_at'], 'cad_app_dec_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_application_decisions');
    }
};

