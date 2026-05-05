<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GpsAlert;
use App\Models\GpsPosition;
use App\Models\Vehicle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GpsController extends Controller
{
    public function vehiclesLive(Request $request): JsonResponse
    {
        $limit = min(500, max(1, (int) $request->query('limit', 200)));

        $latest = DB::table('gps_positions as p')
            ->selectRaw('p.vehicle_id, MAX(p.recorded_at) as last_at')
            ->groupBy('p.vehicle_id');

        $rows = DB::table('gps_positions as p')
            ->joinSub($latest, 'lp', function ($j) {
                $j->on('p.vehicle_id', '=', 'lp.vehicle_id')->on('p.recorded_at', '=', 'lp.last_at');
            })
            ->orderByDesc('p.recorded_at')
            ->limit($limit)
            ->get();

        $vehicleIds = $rows->pluck('vehicle_id')->all();
        $vehicles = Vehicle::query()->whereIn('id', $vehicleIds)->get()->keyBy('id');

        $data = $rows->map(function ($r) use ($vehicles) {
            $v = $vehicles[$r->vehicle_id] ?? null;
            return [
                'vehicle_id' => $r->vehicle_id,
                'registration' => $v?->registration_number,
                'status' => $v?->status,
                'recorded_at' => $r->recorded_at,
                'latitude' => (float) $r->latitude,
                'longitude' => (float) $r->longitude,
                'speed_kmh' => $r->speed_kmh !== null ? (float) $r->speed_kmh : null,
                'odometer_km' => $r->odometer_km !== null ? (float) $r->odometer_km : null,
            ];
        });

        return ApiResponse::success($data);
    }

    public function alerts(Request $request): JsonResponse
    {
        $q = GpsAlert::query()->orderByDesc('triggered_at');
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        $rows = $q->limit(200)->get();

        return ApiResponse::success($rows);
    }

    public function vehiclePositions(Request $request, Vehicle $vehicle): JsonResponse
    {
        $per = min(5000, max(1, (int) $request->query('limit', 200)));
        $rows = GpsPosition::query()
            ->where('vehicle_id', $vehicle->id)
            ->orderByDesc('recorded_at')
            ->limit($per)
            ->get();

        return ApiResponse::success($rows);
    }
}

