<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\Gps\GpsProviderIngestionService;
use App\Services\Gps\GpsProviderManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class GpsWebhookController extends Controller
{
    public function __construct(
        private readonly GpsProviderManager $providerManager,
        private readonly GpsProviderIngestionService $ingestionService,
    ) {}

    public function handle(Request $request, string $provider): JsonResponse
    {
        try {
            $providerEntity = $this->providerManager->getActiveProviderEntity($provider);
            $providerImpl = $this->providerManager->resolveByCode($providerEntity->provider_code);
            $this->validateRequestSecurity($request, $providerEntity, $providerImpl->supportsHmac());

            $normalized = $providerImpl->normalize($request, $providerEntity);
            $result = $this->ingestionService->ingest($normalized);

            Log::info('gps.provider_webhook.handled', [
                'provider' => $providerEntity->provider_code,
                'count' => count($normalized),
                'result' => $result,
            ]);

            return ApiResponse::success([
                'provider' => $providerEntity->provider_code,
                'count' => count($normalized),
                'result' => $result,
            ], null, null, 202);
        } catch (RuntimeException $e) {
            Log::warning('gps.provider_webhook.rejected', [
                'provider' => $provider,
                'error' => $e->getMessage(),
            ]);
            return ApiResponse::error($e->getMessage(), 401);
        } catch (\Throwable $e) {
            Log::error('gps.provider_webhook.error', [
                'provider' => $provider,
                'error' => $e->getMessage(),
            ]);
            return ApiResponse::error('GPS webhook processing failed.', 500);
        }
    }

    private function validateRequestSecurity(Request $request, \App\Models\GpsProvider $provider, bool $supportsHmac): void
    {
        $configuredApiKey = (string) ($provider->api_key ?? '');
        if ($configuredApiKey !== '') {
            $apiKey = (string) $request->header('X-API-KEY', '');
            if ($apiKey === '' || !hash_equals($configuredApiKey, $apiKey)) {
                throw new RuntimeException('GPS provider API key invalid.');
            }
        }

        if ($supportsHmac && !empty($provider->webhook_secret)) {
            $signature = (string) $request->header('X-SIGNATURE', '');
            $computed = hash_hmac('sha256', (string) $request->getContent(), (string) $provider->webhook_secret);
            if ($signature === '' || !hash_equals($computed, $signature)) {
                throw new RuntimeException('GPS provider HMAC signature invalid.');
            }
        }

        $allowlist = is_array($provider->ip_allowlist) ? $provider->ip_allowlist : [];
        if (!empty($allowlist)) {
            $ip = (string) $request->ip();
            if (!in_array($ip, $allowlist, true)) {
                throw new RuntimeException('GPS provider IP not allowed.');
            }
        }
    }
}
