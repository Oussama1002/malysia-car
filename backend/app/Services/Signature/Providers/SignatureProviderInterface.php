<?php

namespace App\Services\Signature\Providers;

use App\Models\SignatureEnvelope;
use App\Models\SignatureSigner;
use Illuminate\Http\Request;

interface SignatureProviderInterface
{
    public function key(): string;

    /**
     * Dispatch signature request to signer(s) and return provider metadata.
     *
     * @return array<string, mixed>
     */
    public function sendEnvelope(SignatureEnvelope $envelope): array;

    public function verifyOtp(SignatureEnvelope $envelope, SignatureSigner $signer, string $otp): bool;

    /**
     * Executes a signer signature action.
     *
     * @return array<string, mixed>
     */
    public function sign(SignatureEnvelope $envelope, SignatureSigner $signer, string $signaturePayload, Request $request): array;

    /**
     * Map external webhook payload to internal normalized event.
     *
     * @return array{event_type:string,envelope_status?:string,signer_status?:string,signer_email?:string,event_data?:array<string,mixed>,idempotency_key?:string}|null
     */
    public function mapWebhookEvent(array $payload, string $provider): ?array;
}
