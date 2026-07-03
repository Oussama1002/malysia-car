<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('company_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->string('group', 60)->index();
            $table->string('key', 120);
            $table->text('value')->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'group', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('company_settings');
    }
};
