<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('vehicles')) {
            return;
        }
        Schema::create('vehicles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable()->index();
            $table->uuid('branch_id')->nullable()->index();

            $table->string('vehicle_code', 80)->nullable()->index();
            $table->string('registration_number')->unique();
            $table->string('vin')->nullable()->unique();

            $table->uuid('brand_id')->nullable();
            $table->uuid('model_id')->nullable();
            $table->foreign('brand_id')->references('id')->on('vehicle_brands')->nullOnDelete();
            $table->foreign('model_id')->references('id')->on('vehicle_models')->nullOnDelete();

            // denormalized display fields (keep even if brand/model records change)
            $table->string('brand_name')->nullable();
            $table->string('model_name')->nullable();

            $table->string('version')->nullable();
            $table->unsignedSmallInteger('year')->nullable();
            $table->string('color')->nullable();
            $table->string('fuel_type')->nullable();
            $table->string('transmission')->nullable();

            $table->unsignedInteger('mileage_current')->nullable();

            $table->string('status')->default('AVAILABLE'); // AVAILABLE, RENTED, MAINTENANCE, BLOCKED, IN_DELIVERY, ...

            $table->string('acquisition_type')->nullable(); // PURCHASE, LOA, LLD, ...
            $table->decimal('purchase_price', 12, 2)->nullable();
            $table->decimal('residual_value', 12, 2)->nullable();
            $table->decimal('book_value', 12, 2)->nullable();

            $table->string('registration_card_number')->nullable();
            $table->date('insurance_expiry')->nullable();
            $table->date('vignette_expiry')->nullable();
            $table->date('tech_control_expiry')->nullable();

            $table->decimal('daily_rental_price', 10, 2)->nullable();
            $table->decimal('monthly_rental_price', 10, 2)->nullable();
            $table->boolean('gps_enabled')->default(false);
            $table->string('availability_status', 30)->default('available');
            $table->date('acquisition_date')->nullable();
            $table->text('notes')->nullable();
            $table->uuid('photo_file_id')->nullable();
            $table->string('image_url')->nullable();

            // optional links (Phase 4 asks for current customer/active contract; keep nullable)
            $table->uuid('current_customer_id')->nullable();
            $table->uuid('current_contract_id')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicles');
    }
};

