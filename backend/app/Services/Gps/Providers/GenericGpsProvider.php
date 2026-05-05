<?php

namespace App\Services\Gps\Providers;

use App\Models\GpsProvider;
use Illuminate\Http\Request;

class GenericGpsProvider implements GpsProviderInterface
{
    public function code(): string
    {
        return 'generic';
    }

    public function supportsHmac(): bool
    {
        return false;
    }

    public function normalize(Request $request, GpsProvider $provider): array
    {
        $payload = $request->all();
        $rows = isset($payload['positions']) && is_array($payload['positions']) ? $payload['positions'] : [$payload];

        return array_values(array_filter(array_map(function (array $p) use ($provider) {
            $imei = (string) ($p['imei'] ?? $p['device_imei'] ?? '');
            if ($imei === '') {
                return null;
            }

            return [
                'provider_code' => $provider->provider_code,
                'provider_message_id' => (string) ($p['message_id'] ?? ''),
                'imei' => $imei,
                'latitude' => $p['latitude'] ?? $p['lat'] ?? null,
                'longitude' => $p['longitude'] ?? $p['lon'] ?? null,
                'speed' => $p['speed'] ?? $p['speed_kmh'] ?? null,
                'heading' => $p['heading'] ?? $p['heading_degrees'] ?? null,
                'odometer' => $p['odometer'] ?? $p['odometer_km'] ?? null,
                'ignition' => $p['ignition'] ?? $p['ignition_on'] ?? null,
                'timestamp' => $p['timestamp'] ?? $p['recorded_at'] ?? now()->toIso8601String(),
                'raw' => $p,
            ];
        }, $rows)));
    }
}
