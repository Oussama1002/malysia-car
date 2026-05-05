<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('maintenance_alerts')) {
            Schema::create('maintenance_alerts', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('vehicle_id')->index();
                $table->unsignedBigInteger('plan_id')->nullable()->index();
                $table->unsignedBigInteger('repair_id')->nullable()->index();
                $table->unsignedBigInteger('document_id')->nullable()->index();
                $table->string('alert_type', 80)->index();
                $table->string('severity', 20)->default('high'); // low|normal|high|critical
                $table->string('status', 20)->default('open'); // open|resolved
                $table->string('title', 255);
                $table->text('description')->nullable();
                $table->json('payload')->nullable();
                $table->timestamp('triggered_at')->useCurrent();
                $table->timestamp('resolved_at')->nullable();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('vehicle_maintenance_plans') && !Schema::hasColumn('vehicle_maintenance_plans', 'status')) {
            Schema::table('vehicle_maintenance_plans', function (Blueprint $table) {
                $table->string('status', 20)->default('ok')->index()->after('next_due_km');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('vehicle_maintenance_plans') && Schema::hasColumn('vehicle_maintenance_plans', 'status')) {
            Schema::table('vehicle_maintenance_plans', function (Blueprint $table) {
                $table->dropColumn('status');
            });
        }

        Schema::dropIfExists('maintenance_alerts');
    }
};
