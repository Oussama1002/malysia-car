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
        if (!Schema::hasTable('signature_providers')) {
            Schema::create('signature_providers', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('provider_key', 32)->unique(); // internal|yousign|docusign|adobe
                $table->string('display_name', 100);
                $table->boolean('is_active')->default(false);
                $table->boolean('is_demo')->default(false);
                $table->string('base_url', 255)->nullable();
                $table->string('webhook_secret', 255)->nullable();
                $table->json('settings')->nullable();
                $table->timestamps();
            });
        }
        if (Schema::hasTable('signature_providers')) {
            $defaults = [
                ['provider_key' => 'internal', 'display_name' => 'Internal OTP (demo)', 'is_active' => true, 'is_demo' => true],
                ['provider_key' => 'yousign', 'display_name' => 'Yousign', 'is_active' => false, 'is_demo' => false],
                ['provider_key' => 'docusign', 'display_name' => 'DocuSign', 'is_active' => false, 'is_demo' => false],
                ['provider_key' => 'adobe', 'display_name' => 'Adobe Sign', 'is_active' => false, 'is_demo' => false],
            ];
            foreach ($defaults as $provider) {
                $exists = DB::table('signature_providers')->where('provider_key', $provider['provider_key'])->exists();
                if (!$exists) {
                    DB::table('signature_providers')->insert([
                        'id' => (string) Str::uuid(),
                        ...$provider,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        }

        Schema::table('signature_envelopes', function (Blueprint $table) {
            if (!Schema::hasColumn('signature_envelopes', 'source_file_id')) {
                $table->uuid('source_file_id')->nullable()->index();
            }
            if (!Schema::hasColumn('signature_envelopes', 'signed_file_id')) {
                $table->uuid('signed_file_id')->nullable()->index();
            }
            if (!Schema::hasColumn('signature_envelopes', 'certificate_file_id')) {
                $table->uuid('certificate_file_id')->nullable()->index();
            }
            if (!Schema::hasColumn('signature_envelopes', 'proof_metadata')) {
                $table->json('proof_metadata')->nullable();
            }
        });

        Schema::table('signature_events', function (Blueprint $table) {
            if (!Schema::hasColumn('signature_events', 'idempotency_key')) {
                $table->string('idempotency_key', 191)->nullable()->unique()->after('event_type');
            }
        });
    }

    public function down(): void
    {
        Schema::table('signature_events', function (Blueprint $table) {
            if (Schema::hasColumn('signature_events', 'idempotency_key')) {
                $table->dropUnique(['idempotency_key']);
                $table->dropColumn('idempotency_key');
            }
        });

        Schema::table('signature_envelopes', function (Blueprint $table) {
            $toDrop = [];
            foreach (['source_file_id', 'signed_file_id', 'certificate_file_id', 'proof_metadata'] as $column) {
                if (Schema::hasColumn('signature_envelopes', $column)) {
                    $toDrop[] = $column;
                }
            }
            if ($toDrop !== []) {
                $table->dropColumn($toDrop);
            }
        });

        if (Schema::hasTable('signature_providers')) {
            Schema::dropIfExists('signature_providers');
        }
    }
};
