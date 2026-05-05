<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('vehicle_insurance_policies')) {
            Schema::create('vehicle_insurance_policies', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->char('vehicle_id', 36)->index();
                $table->string('insurer_name', 160);
                $table->string('policy_number', 120);
                $table->string('coverage_type', 80)->nullable();
                $table->date('start_date');
                $table->date('end_date');
                $table->decimal('premium_amount', 12, 2)->nullable();
                $table->string('status', 32)->default('active'); // draft|active|expired|cancelled
                $table->uuid('document_file_id')->nullable()->index();
                $table->timestamps();
                $table->softDeletes();

                $table->unique(['vehicle_id', 'policy_number']);
                $table->index(['status', 'end_date']);
                $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
            });
        }

        if (!Schema::hasTable('insurance_claims')) {
            Schema::create('insurance_claims', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->unsignedBigInteger('accident_id')->nullable()->index();
                $table->char('vehicle_id', 36)->index();
                $table->string('insurer_name', 160);
                $table->string('claim_number', 120)->unique();
                $table->dateTime('declared_at');
                $table->decimal('estimated_amount', 12, 2)->nullable();
                $table->decimal('approved_amount', 12, 2)->nullable();
                $table->decimal('reimbursed_amount', 12, 2)->nullable();
                $table->string('status', 32)->default('declared'); // declared|under_review|approved|reimbursed|rejected|closed
                $table->timestamps();

                $table->index(['vehicle_id', 'status']);
                $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
                $table->foreign('accident_id')->references('id')->on('vehicle_accidents')->nullOnDelete();
            });
        }

        if (!Schema::hasTable('vehicle_technical_inspections')) {
            Schema::create('vehicle_technical_inspections', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->char('vehicle_id', 36)->index();
                $table->date('inspection_date');
                $table->date('expiry_date');
                $table->string('center_name', 160)->nullable();
                $table->string('result', 32)->default('passed'); // passed|conditional|failed
                $table->json('defects')->nullable();
                $table->uuid('document_file_id')->nullable()->index();
                $table->date('next_due_date')->nullable();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['result', 'expiry_date']);
                $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
            });
        }

        if (!Schema::hasTable('compliance_alerts')) {
            Schema::create('compliance_alerts', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->char('vehicle_id', 36)->index();
                $table->string('alert_type', 80); // insurance_expired|insurance_expiring_soon|technical_expired|technical_expiring_soon|missing_documents
                $table->string('severity', 20)->default('high'); // low|normal|high|critical
                $table->string('status', 20)->default('open'); // open|resolved
                $table->string('title', 191);
                $table->string('description', 500)->nullable();
                $table->date('due_date')->nullable();
                $table->json('payload')->nullable();
                $table->timestamp('triggered_at')->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->timestamps();

                $table->unique(['vehicle_id', 'alert_type', 'status']);
                $table->index(['status', 'severity', 'triggered_at']);
                $table->foreign('vehicle_id')->references('id')->on('vehicles')->cascadeOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('compliance_alerts');
        Schema::dropIfExists('vehicle_technical_inspections');
        Schema::dropIfExists('insurance_claims');
        Schema::dropIfExists('vehicle_insurance_policies');
    }
};
