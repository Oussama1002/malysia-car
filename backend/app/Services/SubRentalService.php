<?php

namespace App\Services;

use App\Models\Reservation;
use App\Models\SubRentalContract;
use App\Models\SubRentalPayment;
use App\Models\SubRentalReturnReport;
use App\Models\SupplierAgency;
use App\Models\Vehicle;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SubRentalService
{
    public function createContract(array $data, string $userId): SubRentalContract
    {
        return DB::transaction(function () use ($data, $userId): SubRentalContract {
            $agency = SupplierAgency::findOrFail($data['supplier_agency_id']);

            $start = Carbon::parse($data['start_date']);
            $end = Carbon::parse($data['end_date']);

            if ($end->lessThanOrEqualTo($start)) {
                throw ValidationException::withMessages([
                    'end_date' => ['La date de fin doit être postérieure à la date de début.'],
                ]);
            }

            $days = max(1, $start->diffInDays($end));
            $dailyCost = (float) ($data['daily_cost'] ?? 0);
            $totalCost = $days * $dailyCost;

            $contract = SubRentalContract::create([
                'company_id'               => $data['company_id'],
                'branch_id'                => $data['branch_id'] ?? null,
                'supplier_agency_id'       => $agency->id,
                'vehicle_id'               => $data['vehicle_id'] ?? null,
                'contract_number'          => $data['contract_number'] ?? null,
                'external_vehicle_identity'=> $data['external_vehicle_identity'] ?? null,
                'start_date'               => $data['start_date'],
                'end_date'                 => $data['end_date'],
                'daily_cost'               => $dailyCost,
                'total_cost'               => $data['total_cost'] ?? $totalCost,
                'deposit_amount'           => $data['deposit_amount'] ?? null,
                'payment_method'           => $data['payment_method'] ?? 'cash',
                'payment_status'           => 'unpaid',
                'status'                   => 'draft',
                'notes'                    => $data['notes'] ?? null,
                'created_by'               => $userId,
            ]);

            return $contract;
        });
    }

    public function activateContract(SubRentalContract $contract, string $userId): SubRentalContract
    {
        return DB::transaction(function () use ($contract, $userId): SubRentalContract {
            if ($contract->status !== 'draft') {
                throw ValidationException::withMessages([
                    'status' => ['Seul un contrat en brouillon peut être activé.'],
                ]);
            }

            $agency = $contract->supplierAgency;
            if ($agency->isBlacklisted()) {
                throw ValidationException::withMessages([
                    'supplier_agency_id' => ['L\'agence fournisseur est sur liste noire.'],
                ]);
            }
            if (!$agency->isActive()) {
                throw ValidationException::withMessages([
                    'supplier_agency_id' => ['L\'agence fournisseur est inactive.'],
                ]);
            }

            if ($contract->end_date->lessThanOrEqualTo($contract->start_date)) {
                throw ValidationException::withMessages([
                    'end_date' => ['La date de fin doit être postérieure à la date de début.'],
                ]);
            }

            // If no vehicle linked, create a temporary sub-rented vehicle
            if (!$contract->vehicle_id) {
                $vehicle = $this->createTemporaryVehicleIfNeeded($contract, $userId);
                $contract->vehicle_id = $vehicle->id;
            } else {
                // Update existing vehicle ownership status
                Vehicle::whereKey($contract->vehicle_id)->update([
                    'ownership_status'    => 'sub_rented',
                    'availability_status' => 'available',
                ]);
            }

            $contract->update([
                'status'       => 'active',
                'activated_by' => $userId,
                'activated_at' => now(),
                'vehicle_id'   => $contract->vehicle_id,
            ]);

            return $contract->fresh(['vehicle', 'supplierAgency']);
        });
    }

    public function returnToSupplier(SubRentalContract $contract, array $data, string $userId): SubRentalContract
    {
        return DB::transaction(function () use ($contract, $data, $userId): SubRentalContract {
            if ($contract->status !== 'active') {
                throw ValidationException::withMessages([
                    'status' => ['Seul un contrat actif peut être retourné au fournisseur.'],
                ]);
            }

            // Block if vehicle is currently rented to a customer
            if ($contract->vehicle_id) {
                $activeCustomerRental = Reservation::query()
                    ->where('vehicle_id', $contract->vehicle_id)
                    ->whereIn('status', [
                        'confirmed', 'pickup_scheduled', 'handed_over',
                        'active', 'extension_requested', 'return_scheduled',
                    ])
                    ->exists();

                if ($activeCustomerRental) {
                    throw ValidationException::withMessages([
                        'vehicle_id' => ['Impossible de retourner le véhicule au fournisseur : une location client est en cours.'],
                    ]);
                }
            }

            // Create return report
            SubRentalReturnReport::create([
                'sub_rental_contract_id' => $contract->id,
                'vehicle_id'             => $contract->vehicle_id,
                'returned_at'            => $data['returned_at'] ?? now(),
                'odometer_km'            => $data['odometer_km'] ?? null,
                'fuel_level'             => $data['fuel_level'] ?? null,
                'condition_notes'        => $data['condition_notes'] ?? null,
                'damage_notes'           => $data['damage_notes'] ?? null,
                'extra_charges'          => $data['extra_charges'] ?? null,
                'signed_by_supplier'     => $data['signed_by_supplier'] ?? null,
                'file_id'                => $data['file_id'] ?? null,
                'created_by'             => $userId,
            ]);

            // Update vehicle status
            if ($contract->vehicle_id) {
                Vehicle::whereKey($contract->vehicle_id)->update([
                    'ownership_status'    => 'owned',
                    'availability_status' => 'unavailable',
                    'status'              => 'available',
                ]);
            }

            $contract->update([
                'status'      => 'returned',
                'returned_by' => $userId,
                'returned_at' => now(),
            ]);

            return $contract->fresh(['returnReport', 'vehicle']);
        });
    }

    public function closeContract(SubRentalContract $contract, string $userId, bool $forceClose = false): SubRentalContract
    {
        return DB::transaction(function () use ($contract, $userId, $forceClose): SubRentalContract {
            if (!in_array($contract->status, ['returned', 'active'], true)) {
                throw ValidationException::withMessages([
                    'status' => ['Le contrat doit être retourné ou actif pour être clôturé.'],
                ]);
            }

            if (!$forceClose && $contract->payment_status !== 'paid') {
                throw ValidationException::withMessages([
                    'payment_status' => ['Le coût fournisseur n\'est pas entièrement payé. Utilisez le paramètre force_close pour forcer la clôture (ADMIN/DIRECTEUR requis).'],
                ]);
            }

            $contract->update([
                'status'    => 'closed',
                'closed_by' => $userId,
                'closed_at' => now(),
            ]);

            return $contract->fresh();
        });
    }

    public function computeProfitability(SubRentalContract $contract): array
    {
        $supplierCost    = (float) $contract->total_cost;
        $customerRevenue = $contract->customerReservationsRevenue();
        $margin          = $customerRevenue - $supplierCost;
        $marginPct       = $supplierCost > 0 ? round(($margin / $supplierCost) * 100, 2) : 0;

        return [
            'supplier_cost'     => $supplierCost,
            'customer_revenue'  => $customerRevenue,
            'margin'            => $margin,
            'margin_percentage' => $marginPct,
            'total_paid'        => $contract->totalPaid(),
            'remaining_balance' => $contract->remainingBalance(),
            'days_count'        => $contract->daysCount(),
            'daily_cost'        => (float) $contract->daily_cost,
        ];
    }

    public function checkCustomerRentalDoesNotExceedSupplierPeriod(
        string $vehicleId,
        Carbon $reservationStart,
        Carbon $reservationEnd
    ): void {
        $activeContract = SubRentalContract::query()
            ->where('vehicle_id', $vehicleId)
            ->where('status', 'active')
            ->first();

        if (!$activeContract) {
            return;
        }

        $supplierEnd = Carbon::parse($activeContract->end_date)->endOfDay();

        if ($reservationEnd->greaterThan($supplierEnd)) {
            throw ValidationException::withMessages([
                'desired_end_at' => [
                    'La réservation dépasse la date de retour fournisseur (' .
                    $activeContract->end_date->format('d/m/Y') . ').',
                ],
                'sub_rental_contract_id' => [$activeContract->id],
            ]);
        }

        if ($reservationStart->lessThan(Carbon::parse($activeContract->start_date)->startOfDay())) {
            throw ValidationException::withMessages([
                'desired_start_at' => [
                    'La réservation commence avant la date de début du contrat fournisseur (' .
                    $activeContract->start_date->format('d/m/Y') . ').',
                ],
            ]);
        }
    }

    private function createTemporaryVehicleIfNeeded(SubRentalContract $contract, string $userId): Vehicle
    {
        $identity = $contract->external_vehicle_identity ?? [];

        if (empty($identity)) {
            throw ValidationException::withMessages([
                'external_vehicle_identity' => ['L\'identité du véhicule fournisseur est requise pour créer un véhicule temporaire.'],
            ]);
        }

        $vehicle = Vehicle::create([
            'id'                   => (string) Str::uuid(),
            'company_id'           => $contract->company_id,
            'branch_id'            => $contract->branch_id,
            'vehicle_code'         => 'SL-' . strtoupper(Str::random(6)),
            'registration_number'  => $identity['registration_number'] ?? ('SL-' . strtoupper(Str::random(6))),
            'color'                => $identity['color'] ?? null,
            'year'                 => $identity['year'] ?? null,
            'mileage_current'      => $identity['mileage'] ?? 0,
            'status'               => 'available',
            'ownership_status'     => 'sub_rented',
            'availability_status'  => 'available',
            'acquisition_type'     => 'sub_rental',
            'notes'                => 'Véhicule sous-location - ' . ($contract->supplierAgency->name ?? ''),
        ]);

        // Link brand and model if provided
        if (!empty($identity['brand_name'])) {
            $brand = \App\Models\VehicleBrand::firstOrCreate(
                ['name' => $identity['brand_name'], 'company_id' => $contract->company_id],
                ['company_id' => $contract->company_id, 'name' => $identity['brand_name']]
            );
            $vehicle->brand_id = $brand->id;
        }

        if (!empty($identity['model_name']) && !empty($vehicle->brand_id)) {
            $model = \App\Models\VehicleModel::firstOrCreate(
                ['name' => $identity['model_name'], 'brand_id' => $vehicle->brand_id],
                ['brand_id' => $vehicle->brand_id, 'name' => $identity['model_name']]
            );
            $vehicle->model_id = $model->id;
        }

        $vehicle->save();

        return $vehicle;
    }
}
