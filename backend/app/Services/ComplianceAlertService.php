<?php

namespace App\Services;

use App\Models\ComplianceAlert;
use App\Models\Vehicle;
use App\Models\VehicleInsurancePolicy;
use App\Models\VehicleTechnicalInspection;
use Illuminate\Support\Str;

class ComplianceAlertService
{
    public function syncVehicle(Vehicle $vehicle): void
    {
        $openTypes = [];
        $now = now()->startOfDay();

        $policy = VehicleInsurancePolicy::query()
            ->where('vehicle_id', $vehicle->id)
            ->whereNull('deleted_at')
            ->orderByDesc('end_date')
            ->first();

        $inspection = VehicleTechnicalInspection::query()
            ->where('vehicle_id', $vehicle->id)
            ->whereNull('deleted_at')
            ->orderByDesc('expiry_date')
            ->first();

        if ($policy) {
            $days = $now->diffInDays($policy->end_date, false);
            if ($days < 0) {
                $openTypes[] = 'insurance_expired';
                $this->openAlert($vehicle, 'insurance_expired', 'critical', 'Assurance expiree', 'La police d assurance est expiree.', $policy->end_date?->toDateString(), ['policy_id' => $policy->id, 'days_remaining' => $days]);
            } elseif ($days <= 30) {
                $openTypes[] = 'insurance_expiring_soon';
                $this->openAlert($vehicle, 'insurance_expiring_soon', 'high', 'Assurance bientot expiree', 'La police d assurance expire sous 30 jours.', $policy->end_date?->toDateString(), ['policy_id' => $policy->id, 'days_remaining' => $days]);
            }
        } else {
            $openTypes[] = 'insurance_missing';
            $this->openAlert($vehicle, 'insurance_missing', 'critical', 'Assurance manquante', 'Aucune police d assurance active rattachee au vehicule.', null, []);
        }

        if ($inspection) {
            $days = $now->diffInDays($inspection->expiry_date, false);
            if ($days < 0) {
                $openTypes[] = 'technical_expired';
                $this->openAlert($vehicle, 'technical_expired', 'critical', 'Visite technique expiree', 'Le controle technique est expire.', $inspection->expiry_date?->toDateString(), ['inspection_id' => $inspection->id, 'days_remaining' => $days]);
            } elseif ($days <= 30) {
                $openTypes[] = 'technical_expiring_soon';
                $this->openAlert($vehicle, 'technical_expiring_soon', 'high', 'Visite technique bientot expiree', 'Le controle technique expire sous 30 jours.', $inspection->expiry_date?->toDateString(), ['inspection_id' => $inspection->id, 'days_remaining' => $days]);
            }
        } else {
            $openTypes[] = 'technical_missing';
            $this->openAlert($vehicle, 'technical_missing', 'critical', 'Visite technique manquante', 'Aucun controle technique enregistre pour ce vehicule.', null, []);
        }

        ComplianceAlert::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('status', 'open')
            ->whereNotIn('alert_type', $openTypes)
            ->update([
                'status' => 'resolved',
                'resolved_at' => now(),
            ]);
    }

    public function syncAll(): void
    {
        // Eager-load the brand/model relations so alerts can name the vehicle
        // even when the denormalized brand_name/model_name columns are empty.
        Vehicle::query()->with(['brand', 'model'])->chunk(200, function ($vehicles): void {
            foreach ($vehicles as $vehicle) {
                $this->syncVehicle($vehicle);
            }
        });
    }

    private function openAlert(Vehicle $vehicle, string $type, string $severity, string $title, string $description, ?string $dueDate, array $payload): void
    {
        // Name the vehicle in every alert: matricule + marque/modèle on the
        // title (e.g. "Assurance manquante · 12345-A-6 (Renault Clio)") and the
        // same identity appended to the description.
        $plate = trim((string) ($vehicle->registration_number ?? ''));
        $brand = $this->vehicleBrand($vehicle);
        $model = $this->vehicleModel($vehicle);
        $label = $this->vehicleLabel($vehicle);
        $title = $label !== '' ? "{$title} · {$label}" : $title;
        $description = $label !== '' ? rtrim($description, '. ') . " (véhicule {$label})." : $description;
        $payload = array_merge($payload, array_filter([
            'vehicle_registration' => $plate !== '' ? $plate : null,
            'vehicle_brand' => $brand !== '' ? $brand : null,
            'vehicle_model' => $model !== '' ? $model : null,
            'vehicle_label' => $label !== '' ? $label : null,
        ]));

        $existing = ComplianceAlert::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('alert_type', $type)
            ->where('status', 'open')
            ->first();

        if ($existing) {
            $existing->update([
                'severity' => $severity,
                'title' => $title,
                'description' => $description,
                'due_date' => $dueDate,
                'payload' => $payload,
            ]);
            return;
        }

        ComplianceAlert::query()->create([
            'id' => (string) Str::uuid(),
            'vehicle_id' => $vehicle->id,
            'alert_type' => $type,
            'severity' => $severity,
            'status' => 'open',
            'title' => $title,
            'description' => $description,
            'due_date' => $dueDate,
            'payload' => $payload,
            'triggered_at' => now(),
        ]);
    }

    /** "12345-A-6 (Renault Clio)" — best available vehicle identity, or "". */
    private function vehicleLabel(Vehicle $vehicle): string
    {
        $plate = trim((string) ($vehicle->registration_number ?? ''));
        $makeModel = trim(implode(' ', array_filter([
            $this->vehicleBrand($vehicle),
            $this->vehicleModel($vehicle),
        ])));

        if ($plate !== '' && $makeModel !== '') {
            return "{$plate} ({$makeModel})";
        }

        return $plate !== '' ? $plate : $makeModel;
    }

    /** Brand from the relation first, then the denormalized column. */
    private function vehicleBrand(Vehicle $vehicle): string
    {
        return trim((string) ($vehicle->brand?->name ?? $vehicle->brand_name ?? ''));
    }

    /** Model from the relation first, then the denormalized column. */
    private function vehicleModel(Vehicle $vehicle): string
    {
        return trim((string) ($vehicle->model?->model_name ?? $vehicle->model?->name ?? $vehicle->model_name ?? ''));
    }
}
