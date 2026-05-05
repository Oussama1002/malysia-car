<?php

namespace App\Services;

use App\Models\AiPrediction;
use App\Models\CreditApplication;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class CreditRiskPredictionService
{
    public function generate(?User $actor = null, bool $persist = true): array
    {
        $apps = CreditApplication::query()->with('customer')->orderByDesc('updated_at')->limit(250)->get();

        $items = $apps->map(function (CreditApplication $app): array {
            $debtRatio = (float) ($app->debt_ratio ?? 0);
            $monthlyIncome = (float) ($app->monthly_income ?? 0);
            $requested = (float) $app->requested_amount;
            $incomeExposure = $monthlyIncome > 0 ? $requested / max(1, $monthlyIncome * 12) : 1.0;

            $score = 0;
            $score += min(55, (int) round($debtRatio * 100));
            $score += min(25, (int) round($incomeExposure * 22));
            if ($app->decision_status === 'rejected') {
                $score += 20;
            } elseif ($app->decision_status === 'pending') {
                $score += 8;
            }
            if ($app->scoring_status !== 'scored') {
                $score += 7;
            }
            $score = min(100, $score);

            $customerName = $app->customer?->displayName() ?? "Client {$app->customer_id}";
            $summary = sprintf(
                'Dossier credit %s: risque %d/100 (debt ratio %.2f).',
                $app->id,
                $score,
                $debtRatio
            );

            return [
                'entity_type' => 'credit_application',
                'entity_id' => $app->id,
                'credit_application_id' => $app->id,
                'customer_id' => $app->customer_id,
                'customer_name' => $customerName,
                'requested_amount' => $requested,
                'debt_ratio' => round($debtRatio, 4),
                'decision_status' => $app->decision_status,
                'scoring_status' => $app->scoring_status,
                'score' => $score,
                'risk_level' => $this->riskLevel($score),
                'label' => 'rule-based insight',
                'requires_human_validation' => true,
                'summary' => $summary,
                'entity_links' => [
                    ['type' => 'customer', 'id' => $app->customer_id, 'path' => "/customers/{$app->customer_id}"],
                    ['type' => 'credit_application', 'id' => $app->id, 'path' => '/credit'],
                ],
            ];
        })->sortByDesc('score')->values();

        if ($persist) {
            $this->persistTopPredictions($items, $actor);
        }

        return [
            'generated_at' => now()->toIso8601String(),
            'total' => $items->count(),
            'high_risk_count' => $items->where('score', '>=', 60)->count(),
            'items' => $items->take(40)->values()->all(),
            'model_mode' => 'rule_based',
        ];
    }

    private function riskLevel(int $score): string
    {
        return match (true) {
            $score >= 75 => 'critical',
            $score >= 60 => 'high',
            $score >= 35 => 'medium',
            default => 'low',
        };
    }

    private function persistTopPredictions(Collection $items, ?User $actor): void
    {
        AiPrediction::query()
            ->where('prediction_type', 'credit-risk')
            ->where('company_id', $actor?->company_id)
            ->delete();

        $items->take(25)->each(function (array $item) use ($actor): void {
            AiPrediction::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $actor?->company_id,
                'branch_id' => null,
                'prediction_type' => 'credit-risk',
                'entity_type' => $item['entity_type'],
                'entity_id' => $item['entity_id'],
                'score' => $item['score'],
                'risk_level' => $item['risk_level'],
                'model_mode' => 'rule_based',
                'provider' => null,
                'summary' => $item['summary'],
                'payload' => $item,
                'predicted_at' => now(),
                'created_by' => $actor?->id,
            ]);
        });
    }
}
