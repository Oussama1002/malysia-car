<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\Mission;
use App\Models\Reservation;
use App\Models\Vehicle;
use App\Models\VehicleAccident;
use App\Models\VehicleRepair;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Validation\ValidationException;

class RentalAvailabilityService
{
    /** Reservation lifecycle states that still occupy the vehicle calendar. */
    private const RESERVATION_BLOCKING_STATUSES = [
        'reserved',
        'confirmed',
        'pickup_scheduled',
        'handed_over',
        'active',
        'extension_requested',
        'return_scheduled',
        'returned',
        'inspection_pending',
        'damage_pending',
        'billing_pending',
        'pending',
    ];

    /** availability_status column — block when not safely rentable. */
    private const AVAILABILITY_STATUS_BLOCKED = [
        'maintenance',
        'repair',
        'accident',
        'unavailable',
        'immobilized',
        'immobilised',
        'blocked',
    ];

    /**
     * Read-only availability check (no row locks).
     *
     * @return array{available: bool, reasons: string[], primary_code: ?string, messages: array<string, string>}
     */
    public function checkVehicleAvailability(
        string $vehicleId,
        CarbonInterface $startAt,
        CarbonInterface $endAt,
        ?string $excludeReservationId = null,
        ?string $excludeContractId = null,
    ): array {
        $vehicle = Vehicle::query()->find($vehicleId);

        return $this->evaluate($vehicle, $vehicleId, $startAt, $endAt, $excludeReservationId, $excludeContractId);
    }

    /**
     * @deprecated Use {@see checkVehicleAvailability} (same behaviour).
     *
     * @return array{available: bool, reasons: string[], primary_code: ?string, messages: array<string, string>}
     */
    public function checkVehicle(
        string $vehicleId,
        CarbonInterface $startAt,
        CarbonInterface $endAt,
        ?string $ignoreReservationId = null,
        ?string $ignoreContractId = null,
    ): array {
        return $this->checkVehicleAvailability($vehicleId, $startAt, $endAt, $ignoreReservationId, $ignoreContractId);
    }

    /**
     * Lock the vehicle row (caller must be inside a DB transaction), then re-evaluate overlaps.
     * Prevents concurrent reservation / confirmation races on the same vehicle.
     */
    public function assertVehicleAvailableWithLock(
        string $vehicleId,
        CarbonInterface $startAt,
        CarbonInterface $endAt,
        ?string $excludeReservationId = null,
        ?string $excludeContractId = null,
    ): void {
        $vehicle = Vehicle::query()->whereKey($vehicleId)->lockForUpdate()->first();
        $result = $this->evaluate($vehicle, $vehicleId, $startAt, $endAt, $excludeReservationId, $excludeContractId);
        $this->throwIfUnavailable($result);
    }

    public function assertVehicleAvailable(
        string $vehicleId,
        CarbonInterface $startAt,
        CarbonInterface $endAt,
        ?string $excludeReservationId = null,
        ?string $excludeContractId = null,
    ): void {
        $result = $this->checkVehicleAvailability($vehicleId, $startAt, $endAt, $excludeReservationId, $excludeContractId);
        $this->throwIfUnavailable($result);
    }

    /**
     * @param array{available: bool, reasons: string[], primary_code: ?string, messages: array<string, string>} $result
     */
    private function throwIfUnavailable(array $result): void
    {
        if ($result['available']) {
            return;
        }

        $codes = $result['reasons'];
        $primary = $result['primary_code'] ?? ($codes[0] ?? 'vehicle_unavailable');
        $human = $result['messages'][$primary] ?? __('Vehicle is not available for this period.');

        throw ValidationException::withMessages([
            'vehicle_id' => [$human],
            'rental' => array_map(static fn (string $c): string => $c, $codes),
        ]);
    }

    /**
     * @return array{available: bool, reasons: string[], primary_code: ?string, messages: array<string, string>}
     */
    private function evaluate(
        ?Vehicle $vehicle,
        string $vehicleId,
        CarbonInterface $startAt,
        CarbonInterface $endAt,
        ?string $excludeReservationId,
        ?string $excludeContractId,
    ): array {
        $reasons = [];
        $messages = [];

        if (! $vehicle) {
            return [
                'available' => false,
                'reasons' => ['vehicle_not_found'],
                'primary_code' => 'vehicle_not_found',
                'messages' => ['vehicle_not_found' => 'Vehicle not found.'],
            ];
        }

        if ($endAt->lessThanOrEqualTo($startAt)) {
            return [
                'available' => false,
                'reasons' => ['invalid_range'],
                'primary_code' => 'invalid_range',
                'messages' => ['invalid_range' => 'End time must be after start time.'],
            ];
        }

        $statusUpper = strtoupper(trim((string) $vehicle->status));
        if (in_array($statusUpper, ['SOLD', 'MAINTENANCE', 'BLOCKED', 'UNAVAILABLE', 'IN_REPAIR', 'ACCIDENT', 'IMMOBILIZED', 'SCRAPPED'], true)
            || in_array(strtolower(trim((string) $vehicle->status)), ['sold', 'maintenance', 'repair', 'accident', 'immobilized', 'immobilised', 'blocked', 'unavailable', 'scrapped', 'in_repair'], true)) {
            $reasons[] = 'vehicle_status_unavailable';
            $messages['vehicle_status_unavailable'] = 'This vehicle cannot be rented (fleet status).';
        }

        $av = strtolower(trim((string) ($vehicle->availability_status ?? 'available')));
        if ($av !== '' && $av !== 'available' && $av !== 'in_use' && in_array($av, self::AVAILABILITY_STATUS_BLOCKED, true)) {
            $reasons[] = 'vehicle_availability_flag';
            $messages['vehicle_availability_flag'] = 'This vehicle is flagged as unavailable for rental.';
        }

        $hasOverlappingReservation = Reservation::query()
            ->where('vehicle_id', $vehicleId)
            ->whereIn('status', self::RESERVATION_BLOCKING_STATUSES)
            ->when($excludeReservationId, fn ($q) => $q->where('id', '!=', $excludeReservationId))
            ->where(function ($q) use ($startAt, $endAt) {
                $q->where('desired_start_at', '<', $endAt)
                    ->where('desired_end_at', '>', $startAt);
            })
            ->exists();

        if ($hasOverlappingReservation) {
            $reasons[] = 'overlapping_reservation';
            $messages['overlapping_reservation'] = 'Another reservation overlaps this period.';
        }

        $periodStart = $startAt->toDateString();
        $periodEnd = $endAt->toDateString();

        $hasActiveContractOverlap = Contract::query()
            ->where('vehicle_id', $vehicleId)
            ->where('status', 'active')
            ->when($excludeContractId, fn ($q) => $q->where('id', '!=', $excludeContractId))
            ->whereRaw(
                'NOT ((end_date IS NOT NULL AND end_date < ?) OR (start_date IS NOT NULL AND start_date > ?))',
                [$periodStart, $periodEnd]
            )
            ->exists();

        if ($hasActiveContractOverlap) {
            $reasons[] = 'active_contract_overlap';
            $messages['active_contract_overlap'] = 'An active finance or lease contract overlaps this period.';
        }

        $hasOverlappingMission = Mission::query()
            ->where('vehicle_id', $vehicleId)
            ->whereNotNull('scheduled_start_at')
            ->whereNotIn('status', ['completed', 'failed', 'cancelled'])
            ->whereRaw(
                'scheduled_start_at < ? AND COALESCE(scheduled_end_at, scheduled_start_at) > ?',
                [$endAt, $startAt]
            )
            ->exists();

        if ($hasOverlappingMission) {
            $reasons[] = 'overlapping_mission';
            $messages['overlapping_mission'] = 'A mission is scheduled for this vehicle during this period.';
        }

        $openRepair = VehicleRepair::query()
            ->where('vehicle_id', $vehicleId)
            ->whereIn('status', ['reported', 'in_progress'])
            ->exists();
        if ($openRepair) {
            $reasons[] = 'vehicle_in_maintenance';
            $messages['vehicle_in_maintenance'] = 'Vehicle has an open repair order.';
        }

        $openAccident = VehicleAccident::query()
            ->where('vehicle_id', $vehicleId)
            ->whereIn('status', ['declared', 'under_review'])
            ->exists();
        if ($openAccident) {
            $reasons[] = 'vehicle_accident_hold';
            $messages['vehicle_accident_hold'] = 'Vehicle has an open accident case.';
        }

        $reasons = array_values(array_unique($reasons));
        $primary = $reasons[0] ?? null;

        return [
            'available' => count($reasons) === 0,
            'reasons' => $reasons,
            'primary_code' => $primary,
            'messages' => $messages,
        ];
    }

    /**
     * Contract activation window: prefer explicit dates; otherwise approximate from activation + duration.
     */
    public function contractActiveWindow(Contract $contract): array
    {
        $start = $contract->start_date
            ? Carbon::parse($contract->start_date)->startOfDay()
            : Carbon::now()->startOfDay();
        $end = $contract->end_date
            ? Carbon::parse($contract->end_date)->endOfDay()
            : ($contract->duration_months
                ? $start->copy()->addMonthsNoOverflow((int) $contract->duration_months)->endOfDay()
                : $start->copy()->addYear()->endOfDay());

        return [$start, $end];
    }
}
