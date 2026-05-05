<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\AnomalyDetectionService;
use App\Services\CashFlowPredictionService;
use App\Services\CreditRiskPredictionService;
use App\Services\MaintenancePredictionService;
use App\Services\VehiclePricingPredictionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiOverviewController extends Controller
{
    public function __construct(
        private readonly MaintenancePredictionService $maintenancePredictionService,
        private readonly CreditRiskPredictionService $creditRiskPredictionService,
        private readonly CashFlowPredictionService $cashFlowPredictionService,
        private readonly VehiclePricingPredictionService $vehiclePricingPredictionService,
        private readonly AnomalyDetectionService $anomalyDetectionService,
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $maintenance = $this->maintenancePredictionService->generate($user, false);
        $creditRisk = $this->creditRiskPredictionService->generate($user, false);
        $cashFlow = $this->cashFlowPredictionService->generate($user, false);
        $pricing = $this->vehiclePricingPredictionService->generate($user, false);
        $anomalies = $this->anomalyDetectionService->generate($user, false);

        return ApiResponse::success([
            'generated_at' => now()->toIso8601String(),
            'provider' => [
                'enabled' => (bool) config('ai.provider.enabled'),
                'configured' => (bool) config('ai.provider.api_key'),
                'mode' => 'rule_based',
            ],
            'kpis' => [
                'maintenance_critical' => $maintenance['critical_count'] ?? 0,
                'credit_high_risk' => $creditRisk['high_risk_count'] ?? 0,
                'cash_overdue_invoices' => $cashFlow['overdue_invoices'] ?? 0,
                'pricing_mispriced' => $pricing['mispriced_count'] ?? 0,
                'anomalies_critical' => $anomalies['critical_count'] ?? 0,
            ],
            'top_insights' => [
                'maintenance' => array_slice($maintenance['items'] ?? [], 0, 5),
                'credit_risk' => array_slice($creditRisk['items'] ?? [], 0, 5),
                'cash_flow' => array_slice($cashFlow['items'] ?? [], 0, 5),
                'vehicle_pricing' => array_slice($pricing['items'] ?? [], 0, 5),
                'anomalies' => array_slice($anomalies['items'] ?? [], 0, 5),
            ],
            'labels' => [
                'rule_based' => 'rule-based insight',
                'ai_assisted' => 'AI-assisted if external provider enabled',
                'human_validation' => 'requires human validation',
            ],
        ]);
    }
}
