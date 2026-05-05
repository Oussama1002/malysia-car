<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GpsProvider;
use App\Services\Gps\GpsProviderIngestionService;
use App\Services\Gps\Providers\GenericGpsProvider;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class GpsPositionIngestionController extends Controller
{
    public function __construct(private readonly GpsProviderIngestionService $ingestionService) {}

    /**
     * Internal test ingestion endpoint: POST /gps/positions
     * Accepts either a single position payload or { positions: [...] } batch.
     * Not intended for production provider integrations.
     */
    public function store(Request $request): JsonResponse
    {
        $provider = new GpsProvider([
            'provider_code' => 'generic',
            'display_name' => 'Generic Internal',
            'active' => true,
        ]);
        $normalized = (new GenericGpsProvider())->normalize($request, $provider);
        $result = $this->ingestionService->ingest($normalized);

        Log::warning('gps.internal_ingestion_endpoint_used', [
            'route' => '/api/v1/gps/positions',
            'recommendation' => '/api/v1/gps/webhooks/{provider}',
        ]);

        return ApiResponse::success([
            'mode' => 'internal_test_only',
            'count' => count($normalized),
            'result' => $result,
        ], null, null, 202);
    }
}

