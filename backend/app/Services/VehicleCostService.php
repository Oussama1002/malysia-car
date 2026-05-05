<?php

namespace App\Services;

use App\Models\Vehicle;
use App\Models\Contract;

class VehicleCostService
{
    /**
     * Full cost + revenue breakdown for a vehicle.
     *
     * @return array<string, mixed>
     */
    public function summary(Vehicle $vehicle): array
    {
        $vehicle->loadMissing([
            'maintenanceEvents',
            'repairs',
            'accidents',
            'costProfile',
        ]);

        // --- Costs ---
        $maintenanceCost = (float) $vehicle->maintenanceEvents->sum('cost_mad');
        $repairCost      = (float) $vehicle->repairs->sum('cost_amount');
        $accidentCost    = (float) $vehicle->accidents->sum('final_cost');

        $profile            = $vehicle->costProfile;
        $insuranceCost      = $profile ? (float) $profile->insurance_monthly_mad * $this->vehicleAgeMonths($vehicle) : 0.0;
        $taxCost            = $profile ? (float) $profile->tax_monthly_mad * $this->vehicleAgeMonths($vehicle) : 0.0;
        $gpsCost            = $profile ? (float) $profile->gps_monthly_mad * $this->vehicleAgeMonths($vehicle) : 0.0;
        $totalCost          = $maintenanceCost + $repairCost + $accidentCost + $insuranceCost + $taxCost + $gpsCost;

        // --- Revenue (from closed/active contracts) ---
        $totalRevenue = (float) Contract::query()
            ->where('vehicle_id', $vehicle->id)
            ->whereIn('status', ['ACTIVE', 'TERMINATED', 'COMPLETED'])
            ->sum('base_amount');

        // --- Acquisition ---
        $purchaseCost  = (float) ($vehicle->purchase_price ?? $profile?->purchase_cost_mad ?? 0);
        $bookValue     = (float) ($vehicle->book_value   ?? $profile?->residual_value_mad ?? 0);

        // --- Immobilisation ---
        $totalDowntimeDays = (int) $vehicle->repairs->sum('downtime_days');

        return [
            'costs' => [
                'maintenance'  => round($maintenanceCost, 2),
                'repairs'      => round($repairCost, 2),
                'accidents'    => round($accidentCost, 2),
                'insurance'    => round($insuranceCost, 2),
                'tax'          => round($taxCost, 2),
                'gps'          => round($gpsCost, 2),
                'total'        => round($totalCost, 2),
            ],
            'revenue'           => round($totalRevenue, 2),
            'gross_margin'      => round($totalRevenue - $totalCost, 2),
            'margin_pct'        => $totalRevenue > 0 ? round((($totalRevenue - $totalCost) / $totalRevenue) * 100, 1) : null,
            'purchase_cost'     => round($purchaseCost, 2),
            'book_value'        => round($bookValue, 2),
            'downtime_days'     => $totalDowntimeDays,
            'contracts_count'   => Contract::query()->where('vehicle_id', $vehicle->id)->count(),
        ];
    }

    private function vehicleAgeMonths(Vehicle $vehicle): int
    {
        $since = $vehicle->costProfile?->acquired_at
            ?? $vehicle->acquisition_date
            ?? $vehicle->created_at;

        if (!$since) {
            return 0;
        }

        return (int) \Carbon\Carbon::parse($since)->diffInMonths(now());
    }
}
