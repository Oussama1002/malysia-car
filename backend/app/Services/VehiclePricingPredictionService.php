<?php

namespace App\Services;

use App\Models\AiPrediction;
use App\Models\UsedCarListing;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class VehiclePricingPredictionService
{
    public function generate(?User $actor = null, bool $persist = true): array
    {
        $listings = UsedCarListing::query()
            ->with('vehicle')
            ->orderByDesc('updated_at')
            ->limit(250)
            ->get();

        $items = $listings->map(function (UsedCarListing $listing): array {
            $vehicle = $listing->vehicle;
            $year = (int) ($vehicle?->year ?? now()->year);
            $mileage = (int) ($listing->mileage_at_listing ?? $vehicle?->mileage_current ?? 0);
            $base = (float) ($listing->estimated_value ?? $listing->asking_price ?? $vehicle?->purchase_price ?? 120000);
            $age = max(0, now()->year - $year);

            $ageFactor = pow(0.9, $age);
            $mileageFactor = max(0.6, 1 - ($mileage / 420000));
            $condition = $listing->inspection_score ? min(1.1, max(0.7, $listing->inspection_score / 10)) : 0.85;
            $predictedPrice = round($base * $ageFactor * $mileageFactor * $condition, 2);
            $asking = (float) ($listing->asking_price ?? 0);
            $delta = round($asking - $predictedPrice, 2);

            $absDelta = abs($delta);
            $score = 0;
            if ($absDelta >= 70000) {
                $score = 90;
            } elseif ($absDelta >= 35000) {
                $score = 70;
            } elseif ($absDelta >= 12000) {
                $score = 45;
            } else {
                $score = 20;
            }

            return [
                'entity_type' => 'used_car_listing',
                'entity_id' => $listing->id,
                'listing_id' => $listing->id,
                'vehicle_id' => $listing->vehicle_id,
                'asking_price' => round($asking, 2),
                'predicted_price' => $predictedPrice,
                'delta' => $delta,
                'stage' => $listing->stage,
                'score' => $score,
                'risk_level' => $this->riskLevel($score),
                'label' => 'rule-based insight',
                'requires_human_validation' => true,
                'summary' => sprintf('Annonce %s: ecart prix %.2f MAD (demande %.2f / suggere %.2f).', $listing->listing_code, $delta, $asking, $predictedPrice),
                'entity_links' => [
                    ['type' => 'used_car_listing', 'id' => $listing->id, 'path' => "/used-cars/{$listing->id}"],
                    ['type' => 'vehicle', 'id' => $listing->vehicle_id, 'path' => "/fleet/{$listing->vehicle_id}"],
                ],
            ];
        })->sortByDesc('score')->values();

        if ($persist) {
            $this->persistTopPredictions($items, $actor);
        }

        return [
            'generated_at' => now()->toIso8601String(),
            'total' => $items->count(),
            'mispriced_count' => $items->where('score', '>=', 45)->count(),
            'items' => $items->take(40)->values()->all(),
            'model_mode' => 'rule_based',
        ];
    }

    private function riskLevel(int $score): string
    {
        return match (true) {
            $score >= 80 => 'critical',
            $score >= 60 => 'high',
            $score >= 40 => 'medium',
            default => 'low',
        };
    }

    private function persistTopPredictions(Collection $items, ?User $actor): void
    {
        AiPrediction::query()
            ->where('prediction_type', 'vehicle-pricing')
            ->where('company_id', $actor?->company_id)
            ->delete();

        $items->take(25)->each(function (array $item) use ($actor): void {
            AiPrediction::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $actor?->company_id,
                'branch_id' => null,
                'prediction_type' => 'vehicle-pricing',
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
