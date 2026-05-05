<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Geofence;
use App\Models\Vehicle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VehicleGeofenceController extends Controller
{
    public function assign(Request $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validate([
            'geofence_ids' => ['required', 'array', 'min:1'],
            'geofence_ids.*' => ['uuid', 'exists:geofences,id'],
        ]);

        DB::transaction(function () use ($vehicle, $data) {
            $sync = [];
            foreach ($data['geofence_ids'] as $gid) {
                $sync[$gid] = ['assigned_at' => now(), 'assigned_by' => auth()->id()];
            }
            $vehicle->geofences()->syncWithoutDetaching($sync);
        });

        $vehicle->load('geofences');

        return ApiResponse::success([
            'vehicle_id' => $vehicle->id,
            'geofences' => $vehicle->geofences,
        ]);
    }
}

