<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('rental_handover_reports')) {
            Schema::create('rental_handover_reports', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('vehicle_id')->index();
                $table->uuid('customer_id')->index();
                $table->uuid('reservation_id')->index();
                $table->uuid('contract_id')->nullable()->index();
                $table->string('handover_type', 20)->index(); // pickup, return
                $table->decimal('odometer', 12, 2)->nullable();
                $table->decimal('fuel_level', 5, 2)->nullable();
                $table->text('condition_notes')->nullable();
                $table->json('checklist')->nullable();
                $table->json('photos')->nullable();
                $table->text('signature')->nullable();
                $table->uuid('performed_by')->nullable()->index();
                $table->timestamp('performed_at')->useCurrent()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('rental_damage_reports')) {
            Schema::create('rental_damage_reports', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('reservation_id')->index();
                $table->uuid('vehicle_id')->index();
                $table->uuid('customer_id')->index();
                $table->string('damage_type', 50)->index();
                $table->text('description')->nullable();
                $table->decimal('estimated_cost', 12, 2)->default(0);
                $table->decimal('final_cost', 12, 2)->nullable();
                $table->string('responsible_party', 30)->default('customer')->index();
                $table->string('status', 30)->default('open')->index(); // open, assessed, invoiced, settled, waived
                $table->uuid('linked_invoice_id')->nullable()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('rental_extensions')) {
            Schema::create('rental_extensions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('reservation_id')->nullable()->index();
                $table->uuid('contract_id')->nullable()->index();
                $table->dateTime('old_end_at');
                $table->dateTime('new_end_at');
                $table->decimal('additional_amount', 12, 2)->default(0);
                $table->string('status', 30)->default('requested')->index(); // requested, approved, rejected, applied
                $table->uuid('requested_by')->nullable()->index();
                $table->dateTime('requested_at');
                $table->dateTime('resolved_at')->nullable();
                $table->uuid('resolved_by')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('rental_extensions');
        Schema::dropIfExists('rental_damage_reports');
        Schema::dropIfExists('rental_handover_reports');
    }
};

