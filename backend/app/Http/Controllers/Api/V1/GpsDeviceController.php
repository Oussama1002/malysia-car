<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GpsDevice;
use App\Models\Vehicle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GpsDeviceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = GpsDevice::query()->orderByDesc('updated_at');
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        return ApiResponse::success($q->limit(500)->get());
    }

    public function show(GpsDevice $gpsDevice): JsonResponse
    {
        return ApiResponse::success($gpsDevice);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_imei' => ['required', 'string', 'max:64'],
            'serial_number' => ['nullable', 'string', 'max:64'],
            'sim_number' => ['nullable', 'string', 'max:64'],
            'provider_name' => ['nullable', 'string', 'max:64'],
            'status' => ['nullable', 'string', 'max:32'],
            'vehicle_id' => ['nullable', 'uuid', 'exists:vehicles,id'],
            'company_id' => ['nullable', 'uuid'],
        ]);

        $dev = DB::transaction(function () use ($data, $request) {
            return GpsDevice::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $data['company_id'] ?? $request->user()?->company_id,
                'vehicle_id' => $data['vehicle_id'] ?? null,
                'device_imei' => $data['device_imei'],
                'serial_number' => $data['serial_number'] ?? null,
                'sim_number' => $data['sim_number'] ?? null,
                'provider_name' => $data['provider_name'] ?? null,
                'status' => $data['status'] ?? 'ACTIVE',
                'last_seen_at' => null,
            ]);
        });

        return ApiResponse::success($dev, null, null, 201);
    }

    public function update(Request $request, GpsDevice $gpsDevice): JsonResponse
    {
        $data = $request->validate([
            'serial_number' => ['sometimes', 'nullable', 'string', 'max:64'],
            'sim_number' => ['sometimes', 'nullable', 'string', 'max:64'],
            'provider_name' => ['sometimes', 'nullable', 'string', 'max:64'],
            'status' => ['sometimes', 'nullable', 'string', 'max:32'],
            'vehicle_id' => ['sometimes', 'nullable', 'uuid', 'exists:vehicles,id'],
        ]);

        foreach (['serial_number', 'sim_number', 'provider_name', 'status', 'vehicle_id'] as $k) {
            if (array_key_exists($k, $data)) {
                $gpsDevice->{$k} = $data[$k];
            }
        }
        $gpsDevice->save();

        return ApiResponse::success($gpsDevice->fresh());
    }

    public function assign(Request $request, GpsDevice $gpsDevice): JsonResponse
    {
        $data = $request->validate([
            'vehicle_id' => ['required', 'uuid', 'exists:vehicles,id'],
        ]);

        /** @var Vehicle $v */
        $v = Vehicle::query()->findOrFail($data['vehicle_id']);

        $gpsDevice->vehicle_id = $v->id;
        $gpsDevice->save();

        return ApiResponse::success(['device' => $gpsDevice, 'vehicle_id' => $v->id]);
    }
}

