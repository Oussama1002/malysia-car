<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\CashFlowPredictionService;
use App\Services\CreditRiskPredictionService;
use App\Services\MaintenancePredictionService;
use App\Services\VehiclePricingPredictionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiPredictionController extends Controller
{
    public function __construct(
        private readonly MaintenancePredictionService $maintenancePredictionService,
        private readonly CreditRiskPredictionService $creditRiskPredictionService,
        private readonly CashFlowPredictionService $cashFlowPredictionService,
        private readonly VehiclePricingPredictionService $vehiclePricingPredictionService,
    ) {
    }

    public function maintenance(Request $request): JsonResponse
    {
        return ApiResponse::success($this->maintenancePredictionService->generate($request->user()));
    }

    public function creditRisk(Request $request): JsonResponse
    {
        return ApiResponse::success($this->creditRiskPredictionService->generate($request->user()));
    }

    public function cashFlow(Request $request): JsonResponse
    {
        return ApiResponse::success($this->cashFlowPredictionService->generate($request->user()));
    }

    public function vehiclePricing(Request $request): JsonResponse
    {
        return ApiResponse::success($this->vehiclePricingPredictionService->generate($request->user()));
    }
}
