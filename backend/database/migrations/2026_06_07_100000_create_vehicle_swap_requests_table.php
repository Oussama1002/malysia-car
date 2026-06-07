<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicle_swap_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable();
            $table->uuid('contract_id')->nullable();
            $table->uuid('reservation_id')->nullable();
            $table->uuid('customer_id');
            $table->uuid('old_vehicle_id');
            $table->uuid('new_vehicle_id');
            $table->string('status', 20)->default('pending'); // pending, approved, rejected
            $table->string('reason')->nullable(); // reason for swap request
            $table->string('rejection_reason')->nullable();
            $table->uuid('requested_by')->nullable(); // user who created the request
            $table->uuid('resolved_by')->nullable(); // admin who approved/rejected
            $table->timestamp('requested_at')->useCurrent();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['contract_id', 'status']);
            $table->index(['reservation_id', 'status']);
            $table->index(['customer_id']);
            $table->index(['status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_swap_requests');
    }
};
