<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_statement_lines', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->date('value_date');
            $table->string('label', 500);
            $table->decimal('amount', 15, 2); // positive = encaissement, negative = décaissement
            $table->string('external_reference', 255)->nullable();
            $table->string('bank_account_code', 40)->nullable();
            $table->string('status', 20)->default('unmatched'); // unmatched|matched|ignored
            $table->uuid('matched_payment_id')->nullable()->index();
            $table->uuid('matched_by_user_id')->nullable();
            $table->timestamp('matched_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'value_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_statement_lines');
    }
};
