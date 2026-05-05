<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('gps_providers')) {
            Schema::create('gps_providers', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('provider_code', 60)->unique();
                $table->string('display_name', 120);
                $table->string('api_key', 255)->nullable();
                $table->string('webhook_secret', 255)->nullable();
                $table->json('ip_allowlist')->nullable();
                $table->boolean('active')->default(false);
                $table->json('settings')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('gps_ingestion_events')) {
            Schema::create('gps_ingestion_events', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('provider_code', 60)->index();
                $table->string('idempotency_key', 190)->unique();
                $table->string('device_imei', 100)->nullable()->index();
                $table->string('status', 30)->default('accepted');
                $table->string('reason', 255)->nullable();
                $table->timestamp('recorded_at')->nullable();
                $table->timestamp('received_at')->useCurrent();
                $table->json('raw_payload')->nullable();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('gps_providers')) {
            $defaults = [
                ['provider_code' => 'generic', 'display_name' => 'Generic Provider', 'active' => true],
                ['provider_code' => 'teltonika', 'display_name' => 'Teltonika Stub', 'active' => false],
                ['provider_code' => 'webhook', 'display_name' => 'Webhook Provider', 'active' => false],
            ];
            foreach ($defaults as $row) {
                DB::table('gps_providers')->updateOrInsert(
                    ['provider_code' => $row['provider_code']],
                    [
                        'id' => DB::table('gps_providers')->where('provider_code', $row['provider_code'])->value('id') ?? (string) Str::uuid(),
                        'display_name' => $row['display_name'],
                        'active' => $row['active'] ? 1 : 0,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('gps_ingestion_events');
        Schema::dropIfExists('gps_providers');
    }
};
