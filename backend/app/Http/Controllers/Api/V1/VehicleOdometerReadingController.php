<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Fleet\StoreOdometerReadingRequest;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleOdometerReading;
use Illuminate\Http\JsonResponse;

class VehicleOdometerReadingController extends Controller
{
    public function store(StoreOdometerReadingRequest $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validated();

        $reading = VehicleOdometerReading::query()->create([
            'vehicle_id' => $vehicle->id,
            'reading_km' => $data['reading_km'],
            'read_at' => $data['read_at'] ?? now(),
            'source' => $data['source'] ?? 'MANUAL',
            'note' => $data['note'] ?? null,
            'created_by' => auth()->id(),
        ]);

        // Keep vehicles.mileage_current in sync with latest manual reading
        if ((int) $data['reading_km'] >= (int) ($vehicle->mileage_current ?? 0)) {
            $vehicle->mileage_current = (int) $data['reading_km'];
            $vehicle->save();
        }

        return ApiResponse::success($reading, null, null, 201);
    }
}

