<?php

namespace App\Services;

use App\Models\Vehicle;
use App\Models\VehicleMaintenancePlan;
use App\Models\VehicleMaintenanceEvent;
use Carbon\Carbon;

class MaintenanceService
{
    /**
     * Create a maintenance plan and compute next due date/km from last event.
     */
    public function createPlan(Vehicle $vehicle, array $data): VehicleMaintenancePlan
    {
        $lastEvent = VehicleMaintenanceEvent::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('type', $data['maintenance_type'])
            ->latest('performed_at')
            ->first();

        $lastDoneAt = isset($data['last_done_at'])
            ? Carbon::parse($data['last_done_at'])
            : (
                $lastEvent?->performed_at
                    ? Carbon::parse($lastEvent->performed_at)
                    : now()
            );

        $nextDueAt = $this->computeNextDate($lastDoneAt, $data['interval_months'] ?? null);
        $nextDueKm = $this->computeNextKm(
            $lastEvent?->odometer_km ?? $vehicle->mileage_current,
            $data['interval_km'] ?? null
        );

        return VehicleMaintenancePlan::create([
            'vehicle_id' => $vehicle->id,
            'maintenance_type' => $data['maintenance_type'],
            'interval_km' => $data['interval_km'] ?? null,
            'interval_months' => $data['interval_months'] ?? null,
            'last_done_at' => $lastDoneAt->toDateString(),
            'next_due_at' => $nextDueAt?->toDateString(),
            'next_due_km' => $nextDueKm,
            'is_active' => true,
            'notes' => $data['notes'] ?? null,
            'created_by' => auth()->id(),
        ]);
    }

    /**
     * After a maintenance event is recorded, advance all matching active plans.
     */
    public function advancePlans(Vehicle $vehicle, VehicleMaintenanceEvent $event): void
    {
        if ($event->type === null || $event->type === '') {
            return;
        }

        $plans = VehicleMaintenancePlan::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('maintenance_type', $event->type)
            ->where('is_active', true)
            ->get();

        $doneAt = $event->performed_at
            ? Carbon::parse($event->performed_at)
            : now();

        foreach ($plans as $plan) {
            $nextDueAt = $this->computeNextDate($doneAt, $plan->interval_months);
            $nextDueKm = $this->computeNextKm($event->odometer_km ?? $vehicle->mileage_current, $plan->interval_km);

            $plan->update([
                'last_done_at' => $doneAt->toDateString(),
                'next_due_at' => $nextDueAt?->toDateString(),
                'next_due_km' => $nextDueKm,
            ]);
        }
    }

    /**
     * Return all active plans for a vehicle with computed status.
     *
     * @return array<int, array<string, mixed>>
     */
    public function duePlans(Vehicle $vehicle): array
    {
        return VehicleMaintenancePlan::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('is_active', true)
            ->orderBy('next_due_at')
            ->get()
            ->map(fn (VehicleMaintenancePlan $p) => [
                'id' => $p->id,
                'type' => $p->maintenance_type,
                'intervalKm' => $p->interval_km,
                'intervalMonths' => $p->interval_months,
                'lastDoneAt' => $p->last_done_at?->toDateString(),
                'nextDueAt' => $p->next_due_at?->toDateString(),
                'nextDueKm' => $p->next_due_km,
                'status' => $p->status,
                'isActive' => $p->is_active,
                'notes' => $p->notes,
            ])
            ->toArray();
    }

    private function computeNextDate(mixed $from, ?int $months): ?Carbon
    {
        if (! $months) {
            return null;
        }
        $base = $from instanceof Carbon ? $from : Carbon::parse($from);

        return $base->copy()->addMonths($months);
    }

    private function computeNextKm(?int $currentKm, ?int $intervalKm): ?int
    {
        if (! $currentKm || ! $intervalKm) {
            return null;
        }

        return $currentKm + $intervalKm;
    }
}
