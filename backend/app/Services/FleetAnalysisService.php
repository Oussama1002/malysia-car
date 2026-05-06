<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Reservation;
use App\Models\SubRentalContract;
use App\Models\Vehicle;
use App\Models\VehicleMaintenanceEvent;

class FleetAnalysisService
{
    /**
     * @return array<string, mixed>
     */
    public function analyze(?string $companyId): array
    {
        $vq = Vehicle::query();
        if ($companyId) {
            $vq->where('company_id', $companyId);
        }
        $totalVehicles = (clone $vq)->count();

        $available = (clone $vq)->where(function ($q): void {
            $q->where('availability_status', 'available')
                ->orWhereNull('availability_status');
        })->whereRaw('LOWER(status) NOT IN (?,?,?,?,?)', ['sold', 'scrapped', 'maintenance', 'blocked', 'unavailable'])
            ->count();

        $rentedByReservation = Reservation::query()
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->whereIn('status', ['handed_over', 'active', 'extension_requested', 'return_scheduled'])
            ->distinct()
            ->count('vehicle_id');

        $inMaint = (clone $vq)->where(function ($q): void {
            $q->where('physical_status', 'maintenance')
                ->orWhereRaw('LOWER(availability_status) IN (?,?,?)', ['maintenance', 'unavailable', 'immobilized']);
        })->count();

        $inRepair = (clone $vq)->where(function ($q): void {
            $q->where('physical_status', 'repair')
                ->orWhereRaw('LOWER(status) IN (?,?,?)', ['maintenance', 'in_repair']);
        })->count();

        $inAccident = (clone $vq)->where('physical_status', 'accident')->count();

        $unavailable = (clone $vq)->where(function ($q): void {
            $q->whereRaw('LOWER(availability_status) IN (?,?,?,?,?)', ['unavailable', 'maintenance', 'repair', 'accident', 'immobilized'])
                ->orWhereIn('physical_status', ['maintenance', 'repair', 'accident', 'immobilized']);
        })->count();

        $utilization = $totalVehicles > 0 ? round(($rentedByReservation / $totalVehicles) * 100, 1) : 0.0;

        $vehicles = (clone $vq)->limit(500)->get();
        $table = [];
        $profits = [];

        foreach ($vehicles as $v) {
            $costSvc = app(VehicleCostService::class)->summary($v);
            $rev = (float) ($costSvc['revenue'] ?? 0);
            $costTotal = (float) ($costSvc['costs']['total'] ?? 0);
            $margin = $rev - $costTotal;
            $profits[$v->id] = $margin;

            $subCost = (float) SubRentalContract::query()
                ->where('vehicle_id', $v->id)
                ->whereIn('status', ['active', 'returned', 'closed'])
                ->sum('total_cost');

            $table[] = [
                'vehicleId' => $v->id,
                'registration' => $v->registration_number,
                'status' => $v->status,
                'availability' => $v->availability_status,
                'physical' => $v->physical_status,
                'ownership' => $v->ownership_status ?? 'owned',
                'revenue' => round($rev, 2),
                'maintenanceCost' => $costSvc['costs']['maintenance'] ?? 0,
                'repairCost' => $costSvc['costs']['repairs'] ?? 0,
                'accidentCost' => $costSvc['costs']['accidents'] ?? 0,
                'subRentalCost' => round($subCost, 2),
                'totalCost' => round($costTotal + $subCost, 2),
                'profitability' => round($margin - $subCost, 2),
                'nextAlert' => $this->nextAlertHint($v),
            ];
        }

        arsort($profits);
        $mostProfitable = array_slice(array_keys($profits), 0, 5);
        $leastProfitable = array_slice(array_keys(array_reverse($profits, true)), 0, 5);

        return [
            'kpis' => [
                'totalVehicles' => $totalVehicles,
                'availableVehicles' => $available,
                'rentedVehiclesApprox' => $rentedByReservation,
                'vehiclesInMaintenance' => $inMaint,
                'vehiclesInRepair' => $inRepair,
                'vehiclesInAccident' => $inAccident,
                'vehiclesUnavailable' => $unavailable,
                'utilizationRatePct' => $utilization,
            ],
            'vehicles' => $table,
            'mostProfitableVehicleIds' => $mostProfitable,
            'leastProfitableVehicleIds' => $leastProfitable,
            'upcomingMaintenance' => $this->upcomingMaintenanceHints($companyId),
            'expiredDocuments' => $this->expiredDocHints($companyId),
            'subRentedCount' => (clone $vq)->where('ownership_status', 'sub_rented')->count(),
        ];
    }

    private function nextAlertHint(Vehicle $v): ?string
    {
        $soonest = null;
        $labels = [];
        foreach (['insurance_expiry' => 'Assurance', 'tech_control_expiry' => 'Contrôle technique', 'vignette_expiry' => 'Vignette'] as $col => $label) {
            $d = $v->{$col};
            if ($d && \Carbon\Carbon::parse($d)->isFuture()) {
                $labels[] = $label.' '.$d;
            }
        }

        return count($labels) ? implode(' · ', array_slice($labels, 0, 2)) : null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function upcomingMaintenanceHints(?string $companyId): array
    {
        $q = VehicleMaintenanceEvent::query()
            ->with('vehicle')
            ->whereNotNull('performed_at')
            ->orderByDesc('performed_at')
            ->limit(20);
        if ($companyId) {
            $q->whereHas('vehicle', fn ($w) => $w->where('company_id', $companyId));
        }

        return $q->get()->map(fn ($e) => [
            'vehicleId' => $e->vehicle_id,
            'registration' => $e->vehicle?->registration_number,
            'type' => $e->type,
            'performedAt' => optional($e->performed_at)?->toDateString(),
        ])->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function expiredDocHints(?string $companyId): array
    {
        $vq = Vehicle::query()->where(function ($q): void {
            $q->whereDate('insurance_expiry', '<', now()->toDateString())
                ->orWhereDate('tech_control_expiry', '<', now()->toDateString())
                ->orWhereDate('vignette_expiry', '<', now()->toDateString());
        });
        if ($companyId) {
            $vq->where('company_id', $companyId);
        }

        return $vq->limit(50)->get()->map(fn ($v) => [
            'vehicleId' => $v->id,
            'registration' => $v->registration_number,
            'insuranceExpiry' => optional($v->insurance_expiry)?->toDateString(),
            'techControlExpiry' => optional($v->tech_control_expiry)?->toDateString(),
        ])->all();
    }
}
