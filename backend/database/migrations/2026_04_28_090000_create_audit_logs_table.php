<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('audit_logs')) {
            return;
        }

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->uuid('branch_id')->nullable()->index();
            $table->uuid('user_id')->nullable()->index();
            $table->string('entity_type', 80)->nullable()->index();
            $table->uuid('entity_id')->nullable()->index();
            $table->string('action_type', 50)->index();
            $table->string('action_label', 120)->nullable();
            $table->string('module_name', 80)->index();
            $table->string('ip_address', 64)->nullable();
            $table->text('user_agent')->nullable();
            $table->json('before_data')->nullable();
            $table->json('after_data')->nullable();
            $table->boolean('legal_significance')->default(false)->index();
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};

