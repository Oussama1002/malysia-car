<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('missions')) {
            return;
        }

        Schema::create('missions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->uuid('branch_id')->nullable()->index();
            $table->string('mission_number', 30)->unique();
            $table->uuid('reservation_id')->nullable()->index();
            $table->uuid('contract_id')->nullable()->index();
            $table->uuid('vehicle_id')->nullable()->index();
            $table->uuid('client_id')->nullable()->index();
            $table->uuid('assigned_user_id')->nullable()->index();
            $table->string('mission_type', 50);
            $table->string('status', 30)->default('planned')->index();
            $table->timestamp('scheduled_start_at')->nullable();
            $table->timestamp('scheduled_end_at')->nullable();
            $table->timestamp('planned_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('actual_start_at')->nullable();
            $table->timestamp('arrived_at')->nullable();
            $table->timestamp('actual_end_at')->nullable();
            $table->string('origin_address', 255)->nullable();
            $table->string('destination_address', 255)->nullable();
            $table->string('pickup_address', 255)->nullable();
            $table->string('dropoff_address', 255)->nullable();
            $table->uuid('customer_signature_file_id')->nullable();
            $table->text('notes')->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('missions');
    }
};
