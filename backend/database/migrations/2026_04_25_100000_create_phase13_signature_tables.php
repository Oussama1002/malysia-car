<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Signature envelopes ──────────────────────────────────────────────
        if (!Schema::hasTable('signature_envelopes')) {
            Schema::create('signature_envelopes', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->string('provider', 32)->default('internal'); // internal|docusign|yousign|adobe
                $table->string('provider_envelope_id')->nullable()->index();
                $table->string('subject');
                $table->text('message')->nullable();
                $table->string('status', 32)->default('draft');
                // draft|sent|in_progress|completed|declined|voided|expired
                $table->nullableUlidMorphs('signable'); // polymorphic: contracts, handover_reports…
                $table->string('document_path')->nullable();        // original doc
                $table->string('signed_document_path')->nullable(); // final signed PDF
                $table->json('metadata')->nullable();               // provider-specific data
                $table->timestamp('expires_at')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->uuid('created_by_user_id')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        // ── Signature signers ────────────────────────────────────────────────
        if (!Schema::hasTable('signature_signers')) {
            Schema::create('signature_signers', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('envelope_id')->index();
                $table->unsignedSmallInteger('signer_order')->default(1);
                $table->string('name');
                $table->string('email');
                $table->string('phone')->nullable();
                $table->string('role', 32)->default('client');
                // client|guarantor|company_rep|witness|notary
                $table->string('status', 32)->default('pending');
                // pending|sent|opened|otp_verified|signed|declined
                $table->string('provider_signer_id')->nullable();
                $table->string('otp_code', 10)->nullable();    // internal OTP
                $table->timestamp('otp_expires_at')->nullable();
                $table->timestamp('signed_at')->nullable();
                $table->timestamp('opened_at')->nullable();
                $table->timestamp('declined_at')->nullable();
                $table->text('decline_reason')->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->string('user_agent')->nullable();
                $table->uuid('user_id')->nullable(); // linked app user if any
                $table->timestamps();

                $table->foreign('envelope_id')->references('id')->on('signature_envelopes')->cascadeOnDelete();
            });
        }

        // ── Signature events ─────────────────────────────────────────────────
        if (!Schema::hasTable('signature_events')) {
            Schema::create('signature_events', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('envelope_id')->index();
                $table->uuid('signer_id')->nullable()->index();
                $table->string('event_type', 64);
                // envelope_created|envelope_sent|envelope_completed|envelope_declined|envelope_voided
                // signer_sent|signer_opened|otp_sent|otp_verified|signer_signed|signer_declined
                // webhook_received
                $table->json('event_data')->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->timestamp('occurred_at')->useCurrent();
                $table->timestamps();

                $table->foreign('envelope_id')->references('id')->on('signature_envelopes')->cascadeOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('signature_events');
        Schema::dropIfExists('signature_signers');
        Schema::dropIfExists('signature_envelopes');
    }
};
