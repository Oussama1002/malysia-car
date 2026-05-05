<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\AnomalyDetectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiAnomalyController extends Controller
{
    public function __construct(private readonly AnomalyDetectionService $anomalyDetectionService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success($this->anomalyDetectionService->generate($request->user()));
    }
}
