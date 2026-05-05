<?php

namespace App\Services\Gps\Providers;

use App\Models\GpsProvider;
use Illuminate\Http\Request;

class TeltonikaProviderStub implements GpsProviderInterface
{
    public function code(): string
    {
        return 'teltonika';
    }

    public function supportsHmac(): bool
    {
        return true;
    }

    public function normalize(Request $request, GpsProvider $provider): array
    {
        $payload = $request->all();
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];

        return array_values(array_filter(array_map(function (array $item) use ($provider) {
            $imei = (string) ($item['imei'] ?? '');
            if ($imei === '') {
                return null;
            }

            return [
                'provider_code' => $provider->provider_code,
                'provider_message_id' => (string) ($item['id'] ?? ''),
                'imei' => $imei,
                'latitude' => $item['gps']['lat'] ?? null,
                'longitude' => $item['gps']['lng'] ?? null,
                'speed' => $item['gps']['speed'] ?? null,
                'heading' => $item['gps']['heading'] ?? null,
                'odometer' => $item['io']['odometer'] ?? null,
                'ignition' => $item['io']['ignition'] ?? null,
                'timestamp' => $item['timestamp'] ?? now()->toIso8601String(),
                'raw' => $item,
            ];
        }, $data)));
    }
}
