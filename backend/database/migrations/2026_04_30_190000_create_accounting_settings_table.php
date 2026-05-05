<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('accounting_settings')) {
            Schema::create('accounting_settings', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->string('setting_key', 80);
                $table->string('setting_value', 80)->nullable();
                $table->timestamps();
                $table->unique(['company_id', 'setting_key']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('accounting_settings');
    }
};
