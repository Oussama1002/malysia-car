<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AiPrediction;
use App\Services\AnomalyDetectionService;
use App\Services\CashFlowPredictionService;
use App\Services\CreditRiskPredictionService;
use App\Services\MaintenancePredictionService;
use App\Services\VehiclePricingPredictionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AiAssistantController extends Controller
{
    public function __construct(
        private readonly MaintenancePredictionService $maintenancePredictionService,
        private readonly CreditRiskPredictionService $creditRiskPredictionService,
        private readonly CashFlowPredictionService $cashFlowPredictionService,
        private readonly VehiclePricingPredictionService $vehiclePricingPredictionService,
        private readonly AnomalyDetectionService $anomalyDetectionService,
    ) {
    }

    public function messages(Request $request): JsonResponse
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:2000'],
            'conversation_id' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);

        $question = trim($data['message']);
        $conversationId = $data['conversation_id'] ?? (string) Str::uuid();
        $intent = $this->detectIntent($question);
        $externalConfigured = (bool) config('ai.provider.enabled') && (bool) config('ai.provider.api_key');
        $user = $request->user();

        $insight = $this->buildInsightFromIntent($intent, $user);
        $references = $this->extractReferences($insight);
        $answer = $this->composeAnswer($intent, $insight);

        $row = AiPrediction::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $user?->company_id,
            'branch_id' => null,
            'prediction_type' => 'assistant',
            'entity_type' => 'conversation',
            'entity_id' => null,
            'score' => null,
            'risk_level' => null,
            'model_mode' => 'rule_based',
            'provider' => $externalConfigured ? (string) config('ai.provider.name') : null,
            'summary' => $answer,
            'payload' => [
                'conversation_id' => $conversationId,
                'intent' => $intent,
                'question' => $question,
                'answer' => $answer,
                'references' => $references,
            ],
            'predicted_at' => now(),
            'created_by' => $user?->id,
        ]);

        return ApiResponse::success([
            'id' => $row->id,
            'conversation_id' => $conversationId,
            'intent' => $intent,
            'answer' => $answer,
            'references' => $references,
            'mode' => 'rule_based',
            'labels' => [
                'rule_based' => 'rule-based insight',
                'ai_assisted' => 'AI-assisted if external provider enabled',
                'human_validation' => 'requires human validation',
            ],
            'provider' => [
                'enabled' => (bool) config('ai.provider.enabled'),
                'configured' => (bool) config('ai.provider.api_key'),
                'name' => config('ai.provider.name'),
            ],
        ]);
    }

    public function conversations(Request $request): JsonResponse
    {
        $rows = AiPrediction::query()
            ->where('prediction_type', 'assistant')
            ->orderByDesc('predicted_at')
            ->limit(200)
            ->get();

        $grouped = $rows
            ->groupBy(fn (AiPrediction $row) => (string) data_get($row->payload, 'conversation_id', 'unknown'))
            ->map(function ($group, string $conversationId): array {
                $latest = $group->first();
                $latestPayload = (array) ($latest?->payload ?? []);

                return [
                    'conversation_id' => $conversationId,
                    'messages_count' => $group->count(),
                    'last_message' => data_get($latestPayload, 'question'),
                    'last_answer' => data_get($latestPayload, 'answer'),
                    'last_intent' => data_get($latestPayload, 'intent'),
                    'updated_at' => $latest?->predicted_at?->toIso8601String(),
                ];
            })
            ->values()
            ->all();

        return ApiResponse::success($grouped);
    }

    private function detectIntent(string $question): string
    {
        $q = mb_strtolower($question);
        if (str_contains($q, 'maintenance') || str_contains($q, 'flotte') || str_contains($q, 'fleet')) {
            return 'maintenance';
        }
        if (str_contains($q, 'credit') || str_contains($q, 'scoring') || str_contains($q, 'risque credit')) {
            return 'credit-risk';
        }
        if (str_contains($q, 'cash') || str_contains($q, 'tresorerie') || str_contains($q, 'invoice') || str_contains($q, 'facture')) {
            return 'cash-flow';
        }
        if (str_contains($q, 'pricing') || str_contains($q, 'prix') || str_contains($q, 'vo') || str_contains($q, 'used-car')) {
            return 'vehicle-pricing';
        }
        if (str_contains($q, 'anomal') || str_contains($q, 'impaye') || str_contains($q, 'contentieux')) {
            return 'anomalies';
        }

        return 'overview';
    }

    private function buildInsightFromIntent(string $intent, $user): array
    {
        return match ($intent) {
            'maintenance' => $this->maintenancePredictionService->generate($user, false),
            'credit-risk' => $this->creditRiskPredictionService->generate($user, false),
            'cash-flow' => $this->cashFlowPredictionService->generate($user, false),
            'vehicle-pricing' => $this->vehiclePricingPredictionService->generate($user, false),
            'anomalies' => $this->anomalyDetectionService->generate($user, false),
            default => $this->anomalyDetectionService->generate($user, false),
        };
    }

    private function composeAnswer(string $intent, array $insight): string
    {
        $top = $insight['items'][0] ?? null;
        $headline = match ($intent) {
            'maintenance' => "Vue flotte: {$insight['critical_count']} vehicules critiques et {$insight['high_count']} vehicules en risque eleve.",
            'credit-risk' => "Vue credit: {$insight['high_risk_count']} dossiers a risque eleve.",
            'cash-flow' => "Vue tresorerie: {$insight['overdue_invoices']} factures en retard.",
            'vehicle-pricing' => "Vue pricing VO: {$insight['mispriced_count']} annonces avec ecart de prix significatif.",
            'anomalies' => "Vue anomalies: {$insight['critical_count']} alertes critiques detectees.",
            default => "Resume deterministe ERP disponible.",
        };

        $detail = $top ? ' Priorite: '.($top['summary'] ?? 'Aucun detail disponible.') : ' Aucune priorite immediate.';

        return $headline.$detail.' Cette reponse est generee en mode rule-based insight.';
    }

    private function extractReferences(array $insight): array
    {
        $refs = [];
        foreach (array_slice($insight['items'] ?? [], 0, 3) as $item) {
            foreach (($item['entity_links'] ?? []) as $link) {
                $refs[] = $link;
            }
        }

        return $refs;
    }
}
