<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Contract;
use App\Models\Reservation;
use App\Models\Vehicle;
use App\Models\VehicleMaintenanceEvent;
use App\Models\VehicleRepair;

/**
 * Centralizes availability / unavailability flags for fleet operations.
 */
class VehicleOperationalService
{
    public function markUnavailable(Vehicle $vehicle, string $availabilityStatus, string $physicalStatus, string $reason): void
    {
        $vehicle->availability_status = $availabilityStatus;
        $vehicle->physical_status = $physicalStatus;
        $vehicle->unavailability_reason = $reason;
        $vehicle->save();
    }

    /**
     * Attempts to set vehicle to available when maintenance/repair completes.
     */
    public function tryReleaseAfterWorkshop(Vehicle $vehicle): void
    {
        $openRepair = VehicleRepair::query()
            ->where('vehicle_id', $vehicle->id)
            ->whereIn('status', ['reported', 'in_progress'])
            ->exists();

        $openMaint = VehicleMaintenanceEvent::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('lifecycle_status', 'in_progress')
            ->exists();

        if ($openRepair || $openMaint) {
            return;
        }

        $hasBlockingAccident = \App\Models\VehicleAccident::query()
            ->where('vehicle_id', $vehicle->id)
            ->whereIn('status', ['declared', 'under_review'])
            ->exists();

        if ($hasBlockingAccident) {
            return;
        }

        // Active rental contract overlap with today — keep unavailable if contract logic requires
        $today = now()->toDateString();
        $activeContract = Contract::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('status', 'active')
            ->whereRaw(
                'NOT ((end_date IS NOT NULL AND end_date < ?) OR (start_date IS NOT NULL AND start_date > ?))',
                [$today, $today]
            )
            ->exists();

        if ($activeContract) {
            $vehicle->availability_status = 'in_use';
            $vehicle->physical_status = 'good';
            $vehicle->unavailability_reason = null;
            $vehicle->save();

            return;
        }

        $activeRes = Reservation::query()
            ->where('vehicle_id', $vehicle->id)
            ->whereIn('status', RentalAvailabilityService::blockingReservationStatuses())
            ->exists();

        if ($activeRes) {
            $vehicle->availability_status = 'in_use';
            $vehicle->physical_status = 'good';
            $vehicle->unavailability_reason = null;
            $vehicle->save();

            return;
        }

        $vehicle->availability_status = 'available';
        $vehicle->physical_status = 'good';
        $vehicle->unavailability_reason = null;
        $vehicle->status = 'AVAILABLE';
        $vehicle->save();
    }
}
