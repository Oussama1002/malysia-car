<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('notification_deliveries')) {
            return;
        }

        Schema::create('notification_deliveries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('notification_id')->index();
            $table->string('channel', 16); // in_app|email|sms
            $table->string('status', 24)->default('pending'); // pending|queued|sent|failed|read
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('last_attempt_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->text('error_message')->nullable();
            $table->string('provider_message_id', 120)->nullable();
            $table->string('entity_type', 120)->nullable()->index();
            $table->uuid('entity_id')->nullable()->index();
            $table->string('priority', 16)->nullable();
            $table->timestamps();

            $table->foreign('notification_id')->references('id')->on('app_notifications')->cascadeOnDelete();
            $table->index(['notification_id', 'channel']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_deliveries');
    }
};
