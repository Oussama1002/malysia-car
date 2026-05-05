<?php

namespace App\Services\Signature\Providers;

use App\Models\SignatureEnvelope;
use App\Models\SignatureSigner;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Base implementation for external providers until real HTTP clients are wired.
 * Subclasses only set {@see key()}.
 */
abstract class AbstractExternalSignatureProvider implements ExternalSignatureProviderInterface
{
    abstract public function key(): string;

    public function sendEnvelope(SignatureEnvelope $envelope): array
    {
        $providerEnvelopeId = 'stub_'.$this->key().'_'.Str::uuid()->toString();
        $envelope->provider_envelope_id = $providerEnvelopeId;
        $envelope->save();

        foreach ($envelope->signers as $signer) {
            $signer->update([
                'status' => 'sent',
                'provider_signer_id' => 'stub_signer_'.Str::uuid()->toString(),
            ]);
        }

        return [
            'provider_envelope_id' => $providerEnvelopeId,
            'callback_url' => config('signature.callback_url'),
        ];
    }

    public function verifyOtp(SignatureEnvelope $envelope, SignatureSigner $signer, string $otp): bool
    {
        return false;
    }

    public function sign(SignatureEnvelope $envelope, SignatureSigner $signer, string $signaturePayload, Request $request): array
    {
        return ['attestation' => $this->key().'_stub_signature'];
    }

    public function mapWebhookEvent(array $payload, string $provider): ?array
    {
        $event = strtolower((string) ($payload['event'] ?? $payload['event_name'] ?? ''));
        if ($event === '') {
            return null;
        }

        $mapped = match ($event) {
            'sent', 'envelope-sent' => ['event_type' => 'sent', 'envelope_status' => 'sent'],
            'opened', 'recipient-opened' => ['event_type' => 'opened', 'signer_status' => 'opened'],
            'otp_verified' => ['event_type' => 'otp_verified', 'signer_status' => 'otp_verified'],
            'signed', 'recipient-completed' => ['event_type' => 'signed', 'signer_status' => 'signed'],
            'declined', 'envelope-declined' => ['event_type' => 'declined', 'envelope_status' => 'declined', 'signer_status' => 'declined'],
            'expired', 'envelope-expired' => ['event_type' => 'expired', 'envelope_status' => 'expired'],
            'completed', 'envelope-completed' => [
                'event_type' => 'completed',
                'envelope_status' => 'completed',
                'signed_file_id' => $payload['signed_file_id'] ?? null,
                'certificate_file_id' => $payload['certificate_file_id'] ?? null,
                'proof_metadata' => $payload['proof_metadata'] ?? $payload['certificate'] ?? null,
            ],
            'failed', 'envelope-failed' => ['event_type' => 'failed', 'envelope_status' => 'failed'],
            default => null,
        };

        if (! $mapped) {
            return null;
        }

        $idempotency = (string) ($payload['idempotency_key'] ?? $payload['event_id'] ?? Str::uuid()->toString());

        return [
            ...$mapped,
            'signer_email' => $payload['signer_email'] ?? $payload['email'] ?? null,
            'event_data' => $payload,
            'idempotency_key' => $provider.'|'.$idempotency,
        ];
    }
}
