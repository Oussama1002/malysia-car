<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\RentalHandoverReport;
use App\Models\Reservation;
use App\Models\ReservationDriver;
use Carbon\Carbon;

/**
 * Les valeurs à écrire dans les blancs du contrat papier. Une seule source,
 * partagée par l'impression sur formulaire pré-imprimé et par la version
 * complète sur papier blanc.
 */
class ContractFormFields
{
    /** @return array<string, mixed> */
    public function forContract(Contract $contract): array
    {
        $customer = $contract->customer;
        $vehicle = $contract->vehicle;
        $individual = $customer?->individualProfile;
        $company = $customer?->companyProfile;
        $address = $customer?->addresses?->first();

        $reservation = $contract->reservation_id
            ? Reservation::query()->find($contract->reservation_id)
            : null;
        $driver = $reservation
            ? ReservationDriver::query()
                ->where('reservation_id', $reservation->id)
                ->where('driver_type', 'secondary')
                ->first()
            : null;
        $handovers = $reservation
            ? RentalHandoverReport::query()->where('reservation_id', $reservation->id)->get()
            : collect();
        $pickup = $handovers->firstWhere('handover_type', 'pickup');
        $return = $handovers->firstWhere('handover_type', 'return');

        $start = $reservation?->desired_start_at ?? $contract->start_date;
        $end = $reservation?->desired_end_at ?? $contract->end_date;
        $days = $start && $end
            ? max(1, Carbon::parse($start)->diffInDays(Carbon::parse($end)))
            : null;

        $brand = $vehicle?->brand_name ?? $vehicle?->brand?->name;
        $model = $vehicle?->model_name ?? $vehicle?->model?->name;

        $valid = function ($date): bool {
            if (empty($date)) {
                return false;
            }
            try {
                return Carbon::parse($date)->endOfDay()->gte(now());
            } catch (\Throwable) {
                return false;
            }
        };

        $fuelLevel = function ($level): ?string {
            if ($level === null || $level === '') {
                return null;
            }
            $n = (float) $level;

            return match (true) {
                $n <= 12 => '0',
                $n <= 37 => '1/4',
                $n <= 62 => '1/2',
                $n <= 87 => '3/4',
                default => '4/4',
            };
        };

        $money = fn ($v) => $v === null ? null : number_format((float) $v, 2, ',', ' ');
        $date = fn ($v) => $v ? Carbon::parse($v)->format('d/m/Y') : null;
        $time = fn ($v) => $v ? Carbon::parse($v)->format('H:i') : null;

        return [
            'contract_number' => $contract->contract_number,

            'customer_first_name' => $individual?->first_name,
            'customer_last_name' => $individual?->last_name ?? $company?->trade_name ?? $company?->legal_name,
            'customer_birth_date' => $date($individual?->date_of_birth),
            'customer_birth_place' => $individual?->place_of_birth,
            'customer_cin' => $individual?->national_id_number,
            'customer_passport' => $individual?->passport_number,
            'customer_license' => $individual?->driving_license_number,
            'customer_address' => $address
                ? trim(collect([$address->line1 ?? null, $address->city ?? null])->filter()->implode(', '))
                : ($customer?->address ?? null),
            'customer_phone' => $customer?->phone,
            'customer_mobile' => $customer?->mobile ?? $customer?->phone,

            'driver_first_name' => $driver?->first_name,
            'driver_last_name' => $driver?->last_name,
            'driver_birth_date' => null,
            'driver_cin' => $driver?->cin_passport,
            'driver_passport' => null,
            'driver_license' => $driver?->license_number,
            'driver_address' => null,
            'driver_phone' => $driver?->phone,

            'vehicle_brand' => trim(($brand ?? '').' '.($model ?? '')) ?: null,
            'vehicle_plate' => $vehicle?->registration_number,
            'start_date' => $date($start),
            'start_time' => $time($start),
            'end_date' => $date($end),
            'end_time' => $time($end),
            'delivered_at' => $reservation?->pickup_location ?? $reservation?->pickup_address,
            'returned_at' => $reservation?->return_location,
            'fuel' => $vehicle?->fuel_type,
            'odometer' => $pickup?->odometer || $return?->odometer
                ? trim(($pickup?->odometer ?? '—').' / '.($return?->odometer ?? '—'))
                : null,
            'days' => $days,
            'insurance' => $contract->insurance_included ? 'Incluse' : null,
            'unit_price' => $days ? $money(((float) ($contract->base_amount ?? 0)) / $days) : null,
            'total_ttc' => $money($contract->base_amount),
            'payment_method' => [
                'cash' => 'Espèces', 'especes' => 'Espèces',
                'check' => 'Chèque', 'cheque' => 'Chèque',
                'bank_transfer' => 'Virement', 'virement' => 'Virement',
                'card' => 'Carte', 'carte' => 'Carte',
            ][strtolower((string) $contract->payment_method)] ?? $contract->payment_method,
            'file_ref' => $reservation?->reservation_number,

            'departure_fuel' => $fuelLevel($pickup?->fuel_level),
            'departure_km' => $pickup?->odometer,
            'return_fuel' => $fuelLevel($return?->fuel_level),
            'return_km' => $return?->odometer,

            'papers' => [
                'insurance' => $valid($vehicle?->insurance_expiry),
                'registration' => ! empty($vehicle?->registration_card_number),
                'circulation' => ! empty($vehicle?->registration_card_number),
                'vignette' => $valid($vehicle?->vignette_expiry),
                'inspection' => $valid($vehicle?->tech_control_expiry),
            ],
        ];
    }
}
