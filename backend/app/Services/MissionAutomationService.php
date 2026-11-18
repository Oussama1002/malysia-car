<?php

namespace App\Services;

use App\Models\Mission;
use App\Models\Reservation;
use App\Models\SubRentalContract;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Creates field missions automatically from operational lifecycle events
 * (reservations, sub-rentals, …). Every mission is:
 *   - idempotent: at most one per (auto_source_type, auto_source_id, mission_type);
 *   - unassigned ('pending'): a manager assigns an agent from Suivi des missions;
 *   - non-blocking: a failure here never breaks the originating flow.
 */
class MissionAutomationService
{
    /**
     * Ensure a mission exists for this operational event. Returns the existing
     * one when already present (never duplicates), the new one otherwise, or
     * null when creation failed (logged, never thrown).
     *
     * @param  array<string, mixed>  $attrs
     */
    public function ensureMission(string $sourceType, string $sourceId, string $missionType, array $attrs): ?Mission
    {
        try {
            $existing = Mission::query()
                ->where('auto_source_type', $sourceType)
                ->where('auto_source_id', $sourceId)
                ->where('mission_type', $missionType)
                ->where('status', '!=', 'cancelled')
                ->first();

            if ($existing) {
                return $existing;
            }

            return Mission::create(array_merge([
                'id' => (string) Str::uuid(),
                'status' => 'pending',
                'priority' => 'normal',
                'created_by' => auth()->id(),
            ], $attrs, [
                'auto_source_type' => $sourceType,
                'auto_source_id' => $sourceId,
                'mission_type' => $missionType,
            ]));
        } catch (\Throwable $e) {
            Log::warning('mission_automation.failed', [
                'source' => $sourceType,
                'source_id' => $sourceId,
                'type' => $missionType,
                'err' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * A reservation became a firm booking → a delivery mission on the start
     * date and a pickup (return) mission on the end date.
     */
    public function forReservationReserved(Reservation $reservation): void
    {
        if (! $reservation->desired_start_at || ! $reservation->desired_end_at) {
            return;
        }

        $base = [
            'company_id' => $reservation->company_id,
            'branch_id' => $reservation->branch_id,
            'reservation_id' => $reservation->id,
            'vehicle_id' => $reservation->vehicle_id,
            'client_id' => $reservation->customer_id,
            'origin_address' => $reservation->pickup_address,
            'destination_address' => $reservation->delivery_address,
            'pickup_address' => $reservation->pickup_address,
            'dropoff_address' => $reservation->delivery_address,
        ];

        $this->ensureMission('reservation', (string) $reservation->id, 'delivery', array_merge($base, [
            'scheduled_start_at' => $reservation->desired_start_at,
            'planned_at' => $reservation->desired_start_at,
            'notes' => "Livraison véhicule — réservation {$reservation->reservation_number}",
        ]));

        $this->ensureMission('reservation', (string) $reservation->id, 'pickup', array_merge($base, [
            'scheduled_start_at' => $reservation->desired_end_at,
            'planned_at' => $reservation->desired_end_at,
            'notes' => "Récupération véhicule — réservation {$reservation->reservation_number}",
        ]));
    }

    /**
     * A sub-rental was created/activated → a mission to collect the vehicle
     * from the supplier agency on the sub-rental start date.
     */
    public function forSubRentalPickup(SubRentalContract $contract): void
    {
        $agency = $contract->supplierAgency;
        $address = $this->agencyAddress($contract);

        $this->ensureMission('sub_rental', (string) $contract->id, 'pickup', [
            'company_id' => $contract->company_id,
            'branch_id' => $contract->branch_id,
            'vehicle_id' => $contract->vehicle_id,
            'scheduled_start_at' => $contract->start_date,
            'planned_at' => $contract->start_date,
            'origin_address' => $address,
            'pickup_address' => $address,
            'notes' => 'Récupération véhicule chez le fournisseur'
                . ($agency ? " — {$agency->name}" : '')
                . ($contract->contract_number ? " (SL {$contract->contract_number})" : ''),
        ]);
    }

    /**
     * A sub-rental is being returned to the supplier → a mission to bring the
     * vehicle back to the supplier agency.
     */
    public function forSubRentalReturn(SubRentalContract $contract): void
    {
        $agency = $contract->supplierAgency;
        $address = $this->agencyAddress($contract);

        $this->ensureMission('sub_rental', (string) $contract->id, 'transfer', [
            'company_id' => $contract->company_id,
            'branch_id' => $contract->branch_id,
            'vehicle_id' => $contract->vehicle_id,
            'scheduled_start_at' => $contract->returned_at ?? now(),
            'planned_at' => $contract->returned_at ?? now(),
            'destination_address' => $address,
            'dropoff_address' => $address,
            'notes' => 'Retour véhicule au fournisseur'
                . ($agency ? " — {$agency->name}" : '')
                . ($contract->contract_number ? " (SL {$contract->contract_number})" : ''),
        ]);
    }

    private function agencyAddress(SubRentalContract $contract): ?string
    {
        $agency = $contract->supplierAgency;
        if (! $agency) {
            return null;
        }
        $parts = array_filter([
            $agency->name ?? null,
            $agency->address ?? null,
            $agency->city ?? null,
        ]);

        return $parts === [] ? null : implode(', ', $parts);
    }
}
