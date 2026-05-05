<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Fleet\StoreMaintenanceEventRequest;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleMaintenanceEvent;
use App\Services\AuditLogger;
use App\Services\MaintenanceService;
use Illuminate\Http\JsonResponse;

class VehicleMaintenanceEventController extends Controller
{
    public function __construct(private MaintenanceService $maintSvc) {}

    public function store(StoreMaintenanceEventRequest $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validated();

        $ev = VehicleMaintenanceEvent::query()->create([
            'vehicle_id' => $vehicle->id,
            'type' => $data['type'] ?? null,
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'performed_at' => $data['performed_at'] ?? null,
            'odometer_km' => array_key_exists('odometer_km', $data) && $data['odometer_km'] !== null
                ? (int) $data['odometer_km']
                : null,
            'vendor' => $data['vendor'] ?? null,
            'cost_mad' => array_key_exists('cost_mad', $data) && $data['cost_mad'] !== null
                ? (string) $data['cost_mad']
                : null,
            'created_by' => auth()->id(),
        ]);

        $this->maintSvc->advancePlans($vehicle, $ev);

        AuditLogger::created($ev, $request->user(), request: $request);

        return ApiResponse::success($ev, null, null, 201);
    }
}
