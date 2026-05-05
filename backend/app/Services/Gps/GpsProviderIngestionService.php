<?php

namespace App\Services\Gps;

use App\Models\GpsDevice;
use App\Models\GpsIngestionEvent;
use App\Models\GpsPosition;
use App\Services\NotificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class GpsProviderIngestionService
{
    public function __construct(
        private readonly GpsRuleService $rules,
        private readonly NotificationService $notifications,
    ) {}

    /**
     * @param array<int,array<string,mixed>> $normalizedRows
     * @return array{saved:int,duplicates:int,unknown_devices:int}
     */
    public function ingest(array $normalizedRows): array
    {
        $saved = 0;
        $duplicates = 0;
        $unknown = 0;

        foreach ($normalizedRows as $row) {
            DB::transaction(function () use ($row, &$saved, &$duplicates, &$unknown) {
                $idempotencyKey = $this->idempotencyKey($row);
                $exists = GpsIngestionEvent::query()
                    ->where('idempotency_key', $idempotencyKey)
                    ->exists();
                if ($exists) {
                    $duplicates++;
                    return;
                }

                $device = GpsDevice::query()->where('device_imei', (string) $row['imei'])->first();
                if (!$device || !$device->vehicle_id) {
                    $unknown++;
                    $this->recordEvent($row, $idempotencyKey, 'rejected', 'unknown_device');
                    $this->alertUnknownDevice((string) $row['imei'], (string) $row['provider_code']);
                    return;
                }

                $position = GpsPosition::query()->create([
                    // legacy schema has auto-increment id, so id is intentionally omitted
                    'gps_device_id' => $device->id,
                    'vehicle_id' => $device->vehicle_id,
                    'recorded_at' => $row['timestamp'] ?? now(),
                    'latitude' => $row['latitude'],
                    'longitude' => $row['longitude'],
                    'speed_kmh' => $row['speed'],
                    'heading_degrees' => $row['heading'],
                    'odometer_km' => $row['odometer'],
                    'ignition_on' => (bool) ($row['ignition'] ?? false),
                    'raw_payload' => $row['raw'] ?? $row,
                    'created_at' => now(),
                ]);

                $device->last_seen_at = now();
                $device->save();

                $vehicle = $device->vehicle_id ? DB::table('vehicles')->where('id', $device->vehicle_id)->first() : null;
                if ($vehicle && $position->odometer_km !== null) {
                    DB::table('vehicles')->where('id', $device->vehicle_id)->update([
                        'mileage_current' => (int) round((float) $position->odometer_km),
                        'updated_at' => now(),
                    ]);
                }

                if ($vehicle) {
                    /** @var \App\Models\Vehicle $vehicleModel */
                    $vehicleModel = \App\Models\Vehicle::query()->find($device->vehicle_id);
                    if ($vehicleModel) {
                        $this->rules->afterPositionSaved($device, $vehicleModel, $position);
                    }
                }

                $this->recordEvent($row, $idempotencyKey, 'accepted', null);
                $saved++;
            });
        }

        Log::info('gps.provider_ingestion.summary', [
            'saved' => $saved,
            'duplicates' => $duplicates,
            'unknown_devices' => $unknown,
        ]);

        return ['saved' => $saved, 'duplicates' => $duplicates, 'unknown_devices' => $unknown];
    }

    /**
     * @param array<string,mixed> $row
     */
    private function idempotencyKey(array $row): string
    {
        $base = implode('|', [
            (string) ($row['provider_code'] ?? ''),
            (string) ($row['provider_message_id'] ?? ''),
            (string) ($row['imei'] ?? ''),
            (string) ($row['timestamp'] ?? ''),
            (string) ($row['latitude'] ?? ''),
            (string) ($row['longitude'] ?? ''),
        ]);

        return hash('sha256', $base);
    }

    /**
     * @param array<string,mixed> $row
     */
    private function recordEvent(array $row, string $idempotencyKey, string $status, ?string $reason): void
    {
        GpsIngestionEvent::query()->create([
            'id' => (string) Str::uuid(),
            'provider_code' => (string) ($row['provider_code'] ?? 'unknown'),
            'idempotency_key' => $idempotencyKey,
            'device_imei' => (string) ($row['imei'] ?? ''),
            'status' => $status,
            'reason' => $reason,
            'recorded_at' => $row['timestamp'] ?? null,
            'received_at' => now(),
            'raw_payload' => $row['raw'] ?? $row,
        ]);
    }

    private function alertUnknownDevice(string $imei, string $providerCode): void
    {
        $existing = GpsIngestionEvent::query()
            ->where('device_imei', $imei)
            ->where('status', 'rejected')
            ->where('reason', 'unknown_device')
            ->where('created_at', '>=', now()->subMinutes(30))
            ->exists();
        if ($existing) {
            return;
        }

        $this->notifications->notifyRoles(
            roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR', 'ADMIN'],
            category: 'gps.unknown_device',
            title: 'Device GPS inconnu detecte',
            body: "IMEI {$imei} recu via {$providerCode}.",
            module: 'gps',
            priority: 'high',
            linkUrl: '/gps',
            payload: ['imei' => $imei, 'provider_code' => $providerCode],
        );
    }
}
