<?php

namespace App\Services;

use App\Models\GpsAlert;
use App\Models\MaintenanceAlert;
use App\Models\Vehicle;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class MaintenanceAlertService
{
    public function createAlert(
        Vehicle $vehicle,
        string $type,
        string $severity,
        string $title,
        ?string $description = null,
        array $payload = [],
        ?int $planId = null,
        ?int $repairId = null,
        ?int $documentId = null,
    ): MaintenanceAlert {
        $existing = MaintenanceAlert::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('alert_type', $type)
            ->where('status', 'open')
            ->first();
        if ($existing) {
            return $existing;
        }

        $alert = MaintenanceAlert::query()->create([
            'id' => (string) Str::uuid(),
            'vehicle_id' => $vehicle->id,
            'plan_id' => $planId,
            'repair_id' => $repairId,
            'document_id' => $documentId,
            'alert_type' => $type,
            'severity' => $severity,
            'status' => 'open',
            'title' => $title,
            'description' => $description,
            'payload' => $payload,
            'triggered_at' => now(),
        ]);

        if ($vehicle->gps_enabled) {
            GpsAlert::query()->create([
                'id' => (string) Str::uuid(),
                'vehicle_id' => $vehicle->id,
                'gps_device_id' => null,
                'alert_type' => 'MAINTENANCE_'.$type,
                'severity' => strtoupper($severity) === 'CRITICAL' ? 'CRITICAL' : 'WARN',
                'title' => $title,
                'description' => $description ?? $title,
                'triggered_at' => now(),
                'status' => 'OPEN',
                'metadata_json' => $payload,
                'created_at' => now(),
            ]);
        }

        return $alert;
    }
}
