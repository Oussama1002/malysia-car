<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\SignatureEnvelope;
use App\Models\SignatureEvent;
use App\Services\Signature\SignatureProviderManager;
use App\Services\Signature\SignatureWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SignatureWebhookController extends Controller
{
    public function __construct(
        private readonly SignatureProviderManager $providerManager,
        private readonly SignatureWorkflowService $workflowService,
    ) {}

    /**
     * POST /signatures/webhooks/provider
     * Handles incoming webhook from external signature providers.
     * Route is public (no Sanctum) — secured by provider HMAC verification.
     */
    public function handle(Request $request): JsonResponse
    {
        $provider = strtolower((string) (
            $request->header('X-Signature-Provider')
            ?? $request->input('provider')
            ?? config('signature.default_provider', 'yousign')
        ));
        $payload = $request->all();

        if ($provider === 'internal') {
            return ApiResponse::error('Le fournisseur internal ne reçoit pas de webhooks.', 400);
        }

        try {
            if (! $this->hasValidHmac($request, $provider)) {
                return ApiResponse::error('Signature webhook invalide.', 401);
            }

            DB::transaction(function () use ($provider, $payload, $request) {
                $providerService = $this->providerManager->resolve($provider);
                $mapped = $providerService->mapWebhookEvent($payload, $provider);
                if (! $mapped) {
                    return;
                }

                $providerEnvelopeId = (string) ($payload['provider_envelope_id']
                    ?? $payload['envelope_id']
                    ?? $payload['envelopeId']
                    ?? $payload['procedure_id']
                    ?? $payload['agreementId']
                    ?? '');
                if ($providerEnvelopeId === '') {
                    return;
                }

                $envelope = SignatureEnvelope::where('provider_envelope_id', $providerEnvelopeId)->first();
                if (! $envelope) {
                    return;
                }

                $idempotencyKey = $mapped['idempotency_key'] ?? null;
                if ($idempotencyKey && SignatureEvent::where('idempotency_key', $idempotencyKey)->exists()) {
                    return;
                }

                $signer = null;
                $signerEmail = $mapped['signer_email'] ?? null;
                if (is_string($signerEmail) && $signerEmail !== '') {
                    $signer = $envelope->signers()->where('email', $signerEmail)->first();
                    if ($signer && isset($mapped['signer_status'])) {
                        $signer->update(['status' => $mapped['signer_status']]);
                    }
                }

                if (isset($mapped['envelope_status'])) {
                    $update = ['status' => $mapped['envelope_status']];
                    if ($mapped['envelope_status'] === 'completed') {
                        $update['completed_at'] = now();
                    }
                    $envelope->update($update);
                }

                $this->workflowService->recordEnvelopeEvent(
                    $envelope,
                    $mapped['event_type'],
                    $signer,
                    $mapped['event_data'] ?? $payload,
                    $request,
                    is_string($idempotencyKey) ? $idempotencyKey : null
                );

                if (($mapped['event_type'] ?? null) === 'completed') {
                    $completePayload = array_filter([
                        'signed_file_id' => $mapped['signed_file_id'] ?? null,
                        'certificate_file_id' => $mapped['certificate_file_id'] ?? null,
                        'proof_metadata' => is_array($mapped['proof_metadata'] ?? null) ? $mapped['proof_metadata'] : null,
                    ], static fn ($v) => $v !== null && $v !== '');

                    $this->workflowService->completeEnvelope($envelope, $request, $completePayload);
                }
            });
        } catch (\Throwable $e) {
            Log::error('signature.webhook.error', ['error' => $e->getMessage(), 'provider' => $provider]);
        }

        return response()->json(['received' => true]);
    }

    private function resolveWebhookSecret(string $provider): string
    {
        $perProvider = (string) data_get(config('signature.providers'), $provider.'.webhook_secret', '');
        if ($perProvider !== '') {
            return $perProvider;
        }

        return (string) (config('signature.webhook_secret') ?? '');
    }

    private function hasValidHmac(Request $request, string $provider): bool
    {
        $secret = $this->resolveWebhookSecret($provider);
        if ($secret === '') {
            return app()->environment(['local', 'testing']);
        }

        $provided = (string) (
            $request->header('X-Signature-Hmac')
            ?? $request->header('X-Provider-Signature')
            ?? ''
        );
        if ($provided === '') {
            return false;
        }

        $expected = hash_hmac('sha256', (string) $request->getContent(), $secret);

        return hash_equals($expected, $provided);
    }
}
