<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Self-hosted electronic signature module.
 *
 * - signature_requests : one row per "Envoyer pour signature" action. Holds the
 *   secure token, expiry, signer info and lifecycle status. The token is the
 *   only thing the public signing page needs — no auth.
 * - contract_signatures: the captured signature itself (drawn PNG) plus the
 *   legal metadata (signed_at, IP, user agent) and a link to the generated
 *   proof PDF. One-to-one with a fulfilled signature_request.
 *
 * No FK constraints to `contracts` on purpose: contract ids are char UUIDs and
 * we keep the module decoupled (soft references) to avoid engine/charset
 * migration pitfalls on self-hosted MySQL. Integrity is enforced in code.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('signature_requests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable();
            $table->uuid('contract_id');
            $table->string('token', 96)->unique();
            // sent_for_signature | signed | rejected | expired
            $table->string('status', 32)->default('sent_for_signature');
            $table->string('signer_name')->nullable();
            $table->string('signer_email')->nullable();
            $table->string('signer_phone', 40)->nullable();
            // Generated contract PDF shown to the signer (generated_documents.id).
            $table->uuid('document_id')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('signed_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->string('rejected_reason', 500)->nullable();
            $table->uuid('created_by')->nullable();
            $table->timestamps();

            $table->index(['contract_id', 'status']);
            $table->index('expires_at');
        });

        Schema::create('contract_signatures', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id')->nullable();
            $table->uuid('signature_request_id');
            $table->uuid('contract_id');
            $table->string('signer_name');
            // Drawn signature image (PNG) on the configured disk.
            $table->string('signature_disk', 32)->default('local');
            $table->string('signature_path', 512);
            // Generated signature proof / signed PDF (generated_documents.id).
            $table->uuid('proof_document_id')->nullable();
            $table->timestamp('signed_at');
            $table->string('ip_address', 64)->nullable();
            $table->string('user_agent', 1024)->nullable();
            $table->timestamps();

            $table->index('contract_id');
            $table->index('signature_request_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_signatures');
        Schema::dropIfExists('signature_requests');
    }
};
