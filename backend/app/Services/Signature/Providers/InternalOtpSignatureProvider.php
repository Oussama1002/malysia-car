<?php

namespace App\Services\Signature\Providers;

use App\Models\SignatureEnvelope;
use App\Models\SignatureSigner;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class InternalOtpSignatureProvider implements SignatureProviderInterface
{
    public function key(): string
    {
        return 'internal';
    }

    public function sendEnvelope(SignatureEnvelope $envelope): array
    {
        $firstSigner = $envelope->signers()->where('status', 'pending')->orderBy('signer_order')->first();
        if (! $firstSigner) {
            return [];
        }

        $providerEnvelopeId = 'internal_'.Str::uuid()->toString();
        $envelope->provider_envelope_id = $providerEnvelopeId;
        $envelope->save();

        $otp = $firstSigner->generateOtp();
        $firstSigner->update(['status' => 'sent']);

        $this->maybeLogOtpDemoOnly($envelope, $firstSigner, $otp);

        return [
            'provider_envelope_id' => $providerEnvelopeId,
            'first_signer_id' => $firstSigner->id,
        ];
    }

    /**
     * Never log OTP in production or staging. Only local/testing with explicit env flag.
     */
    private function maybeLogOtpDemoOnly(SignatureEnvelope $envelope, SignatureSigner $signer, string $otp): void
    {
        if (! app()->environment(['local', 'testing'])) {
            return;
        }

        if (! (bool) config('signature.allow_internal_otp_log', false)) {
            return;
        }

        Log::info('signature.internal_otp_issued', [
            'envelope_id' => $envelope->id,
            'signer_id' => $signer->id,
            'email' => $signer->email,
            'otp' => $otp,
            'notice' => 'Demo only — disable SIGNATURE_INTERNAL_OTP_LOG outside local/test.',
        ]);
    }

    public function verifyOtp(SignatureEnvelope $envelope, SignatureSigner $signer, string $otp): bool
    {
        return $signer->verifyOtp($otp);
    }

    public function sign(SignatureEnvelope $envelope, SignatureSigner $signer, string $signaturePayload, Request $request): array
    {
        return ['attestation' => 'internal_demo_signature'];
    }

    public function mapWebhookEvent(array $payload, string $provider): ?array
    {
        return null;
    }
}
