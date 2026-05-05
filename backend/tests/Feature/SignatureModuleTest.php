<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureTenantScope;
use App\Models\GeneratedDocument;
use App\Models\SignatureEnvelope;
use App\Models\SignatureEvent;
use App\Models\SignatureSigner;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class SignatureModuleTest extends TestCase
{
    use RefreshDatabase;

    private function actingStaff(): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Sig Test',
            'email' => 'sig-'.Str::lower(Str::random(8)).'@test.com',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
        ]);
    }

    public function test_internal_send_succeeds_when_pdf_source_exists(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class, EnsureTenantScope::class]);
        Storage::fake('local');

        $path = 'contracts/test-sig.pdf';
        Storage::disk('local')->put($path, '%PDF-1.4 test');

        $doc = GeneratedDocument::query()->create([
            'id' => (string) Str::uuid(),
            'document_type' => 'contract',
            'title' => 'Contrat test',
            'disk' => 'local',
            'storage_path' => $path,
            'mime_type' => 'application/pdf',
            'size_bytes' => strlen('%PDF-1.4 test'),
            'sha256' => hash('sha256', '%PDF-1.4 test'),
        ]);

        $envelope = SignatureEnvelope::query()->create([
            'id' => (string) Str::uuid(),
            'provider' => 'internal',
            'subject' => 'Test env',
            'status' => 'draft',
            'source_file_id' => $doc->id,
        ]);

        SignatureSigner::query()->create([
            'id' => (string) Str::uuid(),
            'envelope_id' => $envelope->id,
            'signer_order' => 1,
            'name' => 'Alice',
            'email' => 'alice@example.com',
            'role' => 'client',
            'status' => 'pending',
        ]);

        $user = $this->actingStaff();
        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/signatures/envelopes/'.$envelope->id.'/send');

        $response->assertOk();
        $envelope->refresh();
        $this->assertSame('sent', $envelope->status);
        $this->assertNotNull($envelope->provider_envelope_id);
    }

    public function test_send_rejects_envelope_without_pdf_source(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class, EnsureTenantScope::class]);

        $envelope = SignatureEnvelope::query()->create([
            'id' => (string) Str::uuid(),
            'provider' => 'internal',
            'subject' => 'Sans PDF',
            'status' => 'draft',
            'source_file_id' => null,
            'document_path' => null,
        ]);

        SignatureSigner::query()->create([
            'id' => (string) Str::uuid(),
            'envelope_id' => $envelope->id,
            'signer_order' => 1,
            'name' => 'Bob',
            'email' => 'bob@example.com',
            'role' => 'client',
            'status' => 'pending',
        ]);

        $user = $this->actingStaff();
        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/signatures/envelopes/'.$envelope->id.'/send');

        $response->assertStatus(422);
    }

    public function test_internal_provider_disabled_when_not_in_allowed_environments(): void
    {
        config([
            'signature.internal_allowed_environments' => [],
            'signature.allow_internal_otp_outside_dev' => false,
        ]);

        $manager = app(\App\Services\Signature\SignatureProviderManager::class);
        $this->assertFalse($manager->canUseInternalProvider('internal'));
        $this->assertTrue($manager->canUseInternalProvider('yousign'));
    }

    public function test_webhook_rejects_invalid_hmac(): void
    {
        config(['signature.providers.yousign.webhook_secret' => 'whsec_test']);

        $response = $this->postJson('/api/v1/signatures/webhooks/provider', [
            'event' => 'completed',
            'provider_envelope_id' => 'x',
        ], [
            'X-Signature-Provider' => 'yousign',
            'X-Signature-Hmac' => 'invalid',
        ]);

        $response->assertStatus(401);
    }

    public function test_webhook_is_idempotent_by_idempotency_key(): void
    {
        config(['signature.providers.yousign.webhook_secret' => 'whsec_test']);

        Storage::fake('local');
        $path = 'contracts/w.pdf';
        Storage::disk('local')->put($path, '%PDF-1.4 w');
        $doc = GeneratedDocument::query()->create([
            'id' => (string) Str::uuid(),
            'document_type' => 'contract',
            'title' => 'W',
            'disk' => 'local',
            'storage_path' => $path,
            'mime_type' => 'application/pdf',
            'size_bytes' => 8,
            'sha256' => hash('sha256', '%PDF-1.4 w'),
        ]);

        $envelope = SignatureEnvelope::query()->create([
            'id' => (string) Str::uuid(),
            'provider' => 'yousign',
            'subject' => 'Webhook',
            'status' => 'sent',
            'source_file_id' => $doc->id,
            'provider_envelope_id' => 'stub_yousign_evt',
        ]);

        SignatureSigner::query()->create([
            'id' => (string) Str::uuid(),
            'envelope_id' => $envelope->id,
            'signer_order' => 1,
            'name' => 'C',
            'email' => 'c@example.com',
            'role' => 'client',
            'status' => 'sent',
        ]);

        $payload = [
            'event' => 'opened',
            'provider_envelope_id' => 'stub_yousign_evt',
            'email' => 'c@example.com',
            'idempotency_key' => 'evt-duplicate',
        ];
        $raw = json_encode($payload, JSON_THROW_ON_ERROR);
        $hmac = hash_hmac('sha256', $raw, 'whsec_test');

        $this->call('POST', '/api/v1/signatures/webhooks/provider', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_SIGNATURE_PROVIDER' => 'yousign',
            'HTTP_X_SIGNATURE_HMAC' => $hmac,
        ], $raw);

        $this->call('POST', '/api/v1/signatures/webhooks/provider', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_SIGNATURE_PROVIDER' => 'yousign',
            'HTTP_X_SIGNATURE_HMAC' => $hmac,
        ], $raw);

        $this->assertSame(1, SignatureEvent::query()->where('idempotency_key', 'yousign|evt-duplicate')->count());
    }

    public function test_completed_webhook_updates_envelope_and_signer(): void
    {
        config(['signature.providers.yousign.webhook_secret' => 'whsec_test']);

        Storage::fake('local');
        $path = 'contracts/c.pdf';
        Storage::disk('local')->put($path, '%PDF-1.4 c');
        $doc = GeneratedDocument::query()->create([
            'id' => (string) Str::uuid(),
            'document_type' => 'contract',
            'title' => 'C',
            'disk' => 'local',
            'storage_path' => $path,
            'mime_type' => 'application/pdf',
            'size_bytes' => 8,
            'sha256' => hash('sha256', '%PDF-1.4 c'),
        ]);

        $envelope = SignatureEnvelope::query()->create([
            'id' => (string) Str::uuid(),
            'provider' => 'yousign',
            'subject' => 'Complete me',
            'status' => 'sent',
            'source_file_id' => $doc->id,
            'provider_envelope_id' => 'stub_yousign_complete',
        ]);

        $signer = SignatureSigner::query()->create([
            'id' => (string) Str::uuid(),
            'envelope_id' => $envelope->id,
            'signer_order' => 1,
            'name' => 'D',
            'email' => 'd@example.com',
            'role' => 'client',
            'status' => 'sent',
        ]);

        $payload = [
            'event' => 'signed',
            'provider_envelope_id' => 'stub_yousign_complete',
            'signer_email' => 'd@example.com',
            'idempotency_key' => 'yousign|signed-1',
        ];
        $raw = json_encode($payload, JSON_THROW_ON_ERROR);
        $hmac = hash_hmac('sha256', $raw, 'whsec_test');
        $this->call('POST', '/api/v1/signatures/webhooks/provider', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_SIGNATURE_PROVIDER' => 'yousign',
            'HTTP_X_SIGNATURE_HMAC' => $hmac,
        ], $raw);

        $signer->refresh();
        $this->assertSame('signed', $signer->status);

        $payload2 = [
            'event' => 'completed',
            'provider_envelope_id' => 'stub_yousign_complete',
            'idempotency_key' => 'yousign|done-1',
        ];
        $raw2 = json_encode($payload2, JSON_THROW_ON_ERROR);
        $hmac2 = hash_hmac('sha256', $raw2, 'whsec_test');
        $this->call('POST', '/api/v1/signatures/webhooks/provider', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_SIGNATURE_PROVIDER' => 'yousign',
            'HTTP_X_SIGNATURE_HMAC' => $hmac2,
        ], $raw2);

        $envelope->refresh();
        $this->assertSame('completed', $envelope->status);
        $this->assertNotNull($envelope->signed_file_id);
    }
}
