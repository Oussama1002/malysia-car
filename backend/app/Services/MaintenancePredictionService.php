<?php

namespace App\Services;

use App\Models\AiPrediction;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class MaintenancePredictionService
{
    public function generate(?User $actor = null, bool $persist = true): array
    {
        $vehicles = Vehicle::query()->orderByDesc('updated_at')->limit(250)->get();
        $now = now()->startOfDay();

        $items = $vehicles->map(function (Vehicle $vehicle) use ($now): array {
            $daysInsurance = $vehicle->insurance_expiry ? $now->diffInDays($vehicle->insurance_expiry, false) : null;
            $daysTech = $vehicle->tech_control_expiry ? $now->diffInDays($vehicle->tech_control_expiry, false) : null;
            $daysVignette = $vehicle->vignette_expiry ? $now->diffInDays($vehicle->vignette_expiry, false) : null;
            $mileage = (int) ($vehicle->mileage_current ?? 0);

            $score = 0;
            $score += $this->expiryPoints($daysInsurance, 35);
            $score += $this->expiryPoints($daysTech, 30);
            $score += $this->expiryPoints($daysVignette, 20);
            if (in_array((string) $vehicle->status, ['MAINTENANCE', 'BLOCKED', 'IN_REPAIR'], true)) {
                $score += 20;
            }
            if ($mileage >= 160000) {
                $score += 18;
            } elseif ($mileage >= 120000) {
                $score += 10;
            } elseif ($mileage >= 80000) {
                $score += 5;
            }
            $score = min(100, $score);

            $summary = sprintf(
                'Vehicule %s: risque maintenance %d/100 (km: %d, assurance: %s, visite: %s).',
                $vehicle->registration_number,
                $score,
                $mileage,
                $daysInsurance === null ? 'N/A' : "{$daysInsurance}j",
                $daysTech === null ? 'N/A' : "{$daysTech}j"
            );

            return [
                'entity_type' => 'vehicle',
                'entity_id' => $vehicle->id,
                'vehicle_id' => $vehicle->id,
                'registration' => $vehicle->registration_number,
                'status' => $vehicle->status,
                'mileage_current' => $mileage,
                'days_to_insurance_expiry' => $daysInsurance,
                'days_to_tech_control_expiry' => $daysTech,
                'days_to_vignette_expiry' => $daysVignette,
                'score' => $score,
                'risk_level' => $this->riskLevel($score),
                'label' => 'rule-based insight',
                'requires_human_validation' => true,
                'summary' => $summary,
                'entity_links' => [
                    ['type' => 'vehicle', 'id' => $vehicle->id, 'path' => "/fleet/{$vehicle->id}"],
                ],
            ];
        })->sortByDesc('score')->values();

        if ($persist) {
            $this->persistTopPredictions($items, $actor);
        }

        return [
            'generated_at' => now()->toIso8601String(),
            'total' => $items->count(),
            'critical_count' => $items->where('score', '>=', 75)->count(),
            'high_count' => $items->filter(fn (array $i) => $i['score'] >= 50 && $i['score'] < 75)->count(),
            'items' => $items->take(40)->values()->all(),
            'model_mode' => 'rule_based',
        ];
    }

    private function expiryPoints(?int $daysToExpiry, int $maxPoints): int
    {
        if ($daysToExpiry === null) {
            return 0;
        }
        if ($daysToExpiry < 0) {
            return $maxPoints;
        }
        if ($daysToExpiry <= 15) {
            return (int) round($maxPoints * 0.7);
        }
        if ($daysToExpiry <= 30) {
            return (int) round($maxPoints * 0.45);
        }
        if ($daysToExpiry <= 60) {
            return (int) round($maxPoints * 0.2);
        }

        return 0;
    }

    private function riskLevel(int $score): string
    {
        return match (true) {
            $score >= 75 => 'critical',
            $score >= 50 => 'high',
            $score >= 25 => 'medium',
            default => 'low',
        };
    }

    private function persistTopPredictions(Collection $items, ?User $actor): void
    {
        AiPrediction::query()
            ->where('prediction_type', 'maintenance')
            ->where('company_id', $actor?->company_id)
            ->delete();

        $items->take(25)->each(function (array $item) use ($actor): void {
            AiPrediction::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $actor?->company_id,
                'branch_id' => null,
                'prediction_type' => 'maintenance',
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
