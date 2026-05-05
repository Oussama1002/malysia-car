<?php

namespace App\Services\Gps;

use App\Models\Contract;
use App\Models\Geofence;
use App\Models\GpsAlert;
use App\Models\GpsDevice;
use App\Models\GpsPosition;
use App\Models\Trip;
use App\Models\Vehicle;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GpsRuleService
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function afterPositionSaved(GpsDevice $device, Vehicle $vehicle, GpsPosition $pos): void
    {
        $this->syncDeviceAssignment($device, $vehicle);
        $this->detectUnauthorizedMovement($device, $vehicle, $pos);
        $this->detectMileageThreshold($device, $vehicle, $pos);
        $this->detectGeofenceTransitions($device, $vehicle, $pos);
        $this->updateTrips($device, $vehicle, $pos);
        $this->detectImmobilizationSuspect($device, $vehicle, $pos);
    }

    private function syncDeviceAssignment(GpsDevice $device, Vehicle $vehicle): void
    {
        if ($device->vehicle_id !== $vehicle->id) {
            $device->vehicle_id = $vehicle->id;
            $device->save();
        }
    }

    private function detectUnauthorizedMovement(GpsDevice $device, Vehicle $vehicle, GpsPosition $pos): void
    {
        $speed = (float) ($pos->speed_kmh ?? 0);
        $moving = $speed >= 5.0 || (bool) ($pos->ignition_on ?? false);
        if (! $moving) {
            return;
        }
        if (! in_array((string) $vehicle->status, ['MAINTENANCE', 'BLOCKED'], true)) {
            return;
        }

        $this->createAlertOncePerWindow(
            vehicleId: $vehicle->id,
            type: 'UNAUTHORIZED_MOVEMENT',
            windowMinutes: 20,
            severity: 'CRITICAL',
            title: 'Mouvement non autorisé',
            description: "Véhicule {$vehicle->registration_number} en statut {$vehicle->status} détecté en mouvement.",
            deviceId: $device->id,
            metadata: ['speed_kmh' => $speed],
        );
    }

    private function detectMileageThreshold(GpsDevice $device, Vehicle $vehicle, GpsPosition $pos): void
    {
        $odo = $pos->odometer_km;
        if ($odo === null) {
            return;
        }

        /** @var Contract|null $c */
        $c = Contract::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('status', 'active')
            ->orderByDesc('activation_date')
            ->first();
        if (! $c || $c->allowed_km === null) {
            return;
        }

        $allowed = (float) $c->allowed_km;
        $current = (float) $odo;
        if ($allowed <= 0) {
            return;
        }

        $pct = $current / $allowed;
        if ($pct < 1.0) {
            return;
        }

        $this->createAlertOncePerWindow(
            vehicleId: $vehicle->id,
            type: 'MILEAGE_THRESHOLD',
            windowMinutes: 120,
            severity: $pct >= 1.1 ? 'CRITICAL' : 'WARN',
            title: 'Dépassement kilométrage contractuel',
            description: "Kilométrage {$current} km > autorisé {$allowed} km (contrat {$c->contract_number}).",
            deviceId: $device->id,
            metadata: ['contract_id' => $c->id, 'allowed_km' => $allowed, 'odometer_km' => $current, 'pct' => $pct],
        );
    }

    private function detectGeofenceTransitions(GpsDevice $device, Vehicle $vehicle, GpsPosition $pos): void
    {
        $lat = $pos->latitude !== null ? (float) $pos->latitude : null;
        $lon = $pos->longitude !== null ? (float) $pos->longitude : null;
        if ($lat === null || $lon === null) {
            return;
        }

        $vehicle->loadMissing('geofences');
        if ($vehicle->geofences->isEmpty()) {
            return;
        }

        foreach ($vehicle->geofences as $g) {
            /** @var Geofence $g */
            $inside = false;
            if ($g->geofence_type === 'CIRCLE' && $g->center_latitude !== null && $g->center_longitude !== null && $g->radius_meters !== null) {
                $inside = Geo::pointInCircle($lat, $lon, (float) $g->center_latitude, (float) $g->center_longitude, (float) $g->radius_meters);
            } else {
                // Polygon support can be added later; default false to avoid false positives.
                $inside = false;
            }

            $state = DB::table('vehicle_geofence_states')->where('vehicle_id', $vehicle->id)->where('geofence_id', $g->id)->first();
            $prev = $state ? (bool) $state->is_inside : false;

            if ($state === null) {
                DB::table('vehicle_geofence_states')->insert([
                    'vehicle_id' => $vehicle->id,
                    'geofence_id' => $g->id,
                    'is_inside' => $inside ? 1 : 0,
                    'last_changed_at' => $inside ? now() : null,
                    'last_evaluated_at' => now(),
                    'metadata_json' => json_encode(['init' => true]),
                ]);
            } else {
                DB::table('vehicle_geofence_states')
                    ->where('vehicle_id', $vehicle->id)
                    ->where('geofence_id', $g->id)
                    ->update([
                        'is_inside' => $inside ? 1 : 0,
                        'last_changed_at' => $inside !== $prev ? now() : $state->last_changed_at,
                        'last_evaluated_at' => now(),
                    ]);
            }

            if ($inside !== $prev) {
                $type = $inside ? 'GEOFENCE_ENTRY' : 'GEOFENCE_EXIT';
                $title = $inside ? 'Entrée zone' : 'Sortie zone';
                $desc = "{$vehicle->registration_number} · {$title}: {$g->name}";
                $this->createAlertOncePerWindow(
                    vehicleId: $vehicle->id,
                    type: $type,
                    windowMinutes: 5,
                    severity: 'INFO',
                    title: $title,
                    description: $desc,
                    deviceId: $device->id,
                    metadata: ['geofence_id' => $g->id, 'geofence_name' => $g->name],
                );
            }
        }
    }

    private function updateTrips(GpsDevice $device, Vehicle $vehicle, GpsPosition $pos): void
    {
        $lat = $pos->latitude !== null ? (float) $pos->latitude : null;
        $lon = $pos->longitude !== null ? (float) $pos->longitude : null;
        $speed = (float) ($pos->speed_kmh ?? 0);
        $ignition = (bool) ($pos->ignition_on ?? false);
        $at = $pos->recorded_at ? Carbon::parse($pos->recorded_at) : Carbon::now();

        /** @var Trip|null $open */
        $open = Trip::query()
            ->where('vehicle_id', $vehicle->id)
            ->whereNull('ended_at')
            ->orderByDesc('started_at')
            ->first();

        if ($ignition && ! $open) {
            Trip::query()->create([
                'id' => (string) Str::uuid(),
                'vehicle_id' => $vehicle->id,
                'gps_device_id' => $device->id,
                'started_at' => $at,
                'start_latitude' => $lat,
                'start_longitude' => $lon,
                'max_speed_kmh' => $speed,
                'metadata_json' => ['source' => 'gps'],
            ]);
            return;
        }

        if (! $open) {
            return;
        }

        // update running max speed + last end coords
        $open->max_speed_kmh = max((float) ($open->max_speed_kmh ?? 0), $speed);
        if ($lat !== null && $lon !== null) {
            $open->end_latitude = $lat;
            $open->end_longitude = $lon;
        }

        // close trip if ignition off OR no signal for long handled elsewhere
        if (! $ignition) {
            $open->ended_at = $at;
            $startLat = $open->start_latitude !== null ? (float) $open->start_latitude : null;
            $startLon = $open->start_longitude !== null ? (float) $open->start_longitude : null;
            $endLat = $open->end_latitude !== null ? (float) $open->end_latitude : null;
            $endLon = $open->end_longitude !== null ? (float) $open->end_longitude : null;
            if ($startLat !== null && $startLon !== null && $endLat !== null && $endLon !== null) {
                $open->distance_km = round(Geo::haversineKm($startLat, $startLon, $endLat, $endLon), 2);
            }
            $open->duration_seconds = $open->ended_at && $open->started_at
                ? max(0, Carbon::parse($open->ended_at)->diffInSeconds(Carbon::parse($open->started_at)))
                : null;
            $open->save();
        } else {
            $open->save();
        }
    }

    private function detectImmobilizationSuspect(GpsDevice $device, Vehicle $vehicle, GpsPosition $pos): void
    {
        $lat = $pos->latitude !== null ? (float) $pos->latitude : null;
        $lon = $pos->longitude !== null ? (float) $pos->longitude : null;
        if ($lat === null || $lon === null) {
            return;
        }
        if (! (bool) ($pos->ignition_on ?? false)) {
            return;
        }

        $since = now()->subMinutes(30);
        $recent = GpsPosition::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('recorded_at', '>=', $since)
            ->orderByDesc('recorded_at')
            ->limit(30)
            ->get();

        if ($recent->count() < 10) {
            return;
        }

        $maxDistM = 0.0;
        foreach ($recent as $r) {
            if ($r->latitude === null || $r->longitude === null) {
                continue;
            }
            $dKm = Geo::haversineKm($lat, $lon, (float) $r->latitude, (float) $r->longitude);
            $maxDistM = max($maxDistM, $dKm * 1000.0);
        }

        // If ignition on but vehicle stayed within 50m for 30 minutes → suspicious stop
        if ($maxDistM <= 50.0) {
            $this->createAlertOncePerWindow(
                vehicleId: $vehicle->id,
                type: 'SUSPECT_IMMOBILIZATION',
                windowMinutes: 60,
                severity: 'WARN',
                title: 'Immobilisation suspecte',
                description: "Immobilisation > 30 min (≈{$maxDistM}m) avec contact ON.",
                deviceId: $device->id,
                metadata: ['max_distance_m' => $maxDistM],
            );
        }
    }

    private function createAlertOncePerWindow(
        string $vehicleId,
        string $type,
        int $windowMinutes,
        string $severity,
        string $title,
        string $description,
        ?string $deviceId = null,
        array $metadata = [],
    ): void {
        $since = now()->subMinutes($windowMinutes);
        $exists = GpsAlert::query()
            ->where('vehicle_id', $vehicleId)
            ->where('alert_type', $type)
            ->where('triggered_at', '>=', $since)
            ->exists();

        if ($exists) {
            return;
        }

        $alert = GpsAlert::query()->create([
            'id' => (string) Str::uuid(),
            'vehicle_id' => $vehicleId,
            'gps_device_id' => $deviceId,
            'alert_type' => $type,
            'severity' => $severity,
            'title' => $title,
            'description' => $description,
            'triggered_at' => now(),
            'status' => 'OPEN',
            'metadata_json' => $metadata,
            'created_at' => now(),
        ]);

        $this->notifications->notifyRoles(
            roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR', 'ADMIN'],
            category: 'gps.alert',
            title: $title,
            body: $description,
            module: 'gps',
            priority: strtoupper($severity) === 'CRITICAL' ? 'critical' : 'high',
            entity: $alert,
            linkUrl: '/gps/alerts',
            payload: [
                'alert_type' => $type,
                'severity' => $severity,
            ],
        );
    }
}

