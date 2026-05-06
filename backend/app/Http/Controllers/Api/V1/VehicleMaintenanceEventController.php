<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Fleet\StoreMaintenanceEventRequest;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleMaintenanceEvent;
use App\Services\AuditLogger;
use App\Services\MaintenanceService;
use App\Services\VehicleOperationalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VehicleMaintenanceEventController extends Controller
{
    public function __construct(
        private MaintenanceService $maintSvc,
        private VehicleOperationalService $ops,
    ) {}

    public function store(StoreMaintenanceEventRequest $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validated();

        $lifecycle = $data['lifecycle_status'] ?? (($data['performed_at'] ?? null) ? 'completed' : null);

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
            'lifecycle_status' => $lifecycle,
            'started_at' => ($lifecycle === 'in_progress') ? now() : null,
            'completed_at' => ($lifecycle === 'completed') ? now() : null,
        ]);

        $this->maintSvc->advancePlans($vehicle, $ev);

        if ($lifecycle === 'in_progress') {
            $this->ops->markUnavailable($vehicle, 'unavailable', 'maintenance', 'Maintenance: '.$ev->title);
        }

        AuditLogger::created($ev, $request->user(), request: $request);

        return ApiResponse::success($ev, null, null, 201);
    }

    public function start(Request $request, VehicleMaintenanceEvent $maintenance_event): JsonResponse
    {
        DB::transaction(function () use ($maintenance_event): void {
            $maintenance_event->lifecycle_status = 'in_progress';
            $maintenance_event->started_at = now();
            $maintenance_event->save();

            $vehicle = $maintenance_event->vehicle;
            if ($vehicle) {
                $this->ops->markUnavailable($vehicle, 'unavailable', 'maintenance', 'Maintenance: '.$maintenance_event->title);
            }
        });

        $fresh = $maintenance_event->fresh();
        AuditLogger::updated($fresh, $request->user(), before: [], after: [], request: $request);

        return ApiResponse::success($fresh);
    }

    public function complete(Request $request, VehicleMaintenanceEvent $maintenance_event): JsonResponse
    {
        $data = $request->validate([
            'performed_at' => ['nullable', 'date'],
            'odometer_km' => ['nullable', 'integer', 'min:0'],
            'cost_mad' => ['nullable', 'numeric', 'min:0'],
            'vendor' => ['nullable', 'string', 'max:255'],
        ]);

        DB::transaction(function () use ($maintenance_event, $data): void {
            $maintenance_event->lifecycle_status = 'completed';
            $maintenance_event->completed_at = now();
            if (! empty($data['performed_at'])) {
                $maintenance_event->performed_at = $data['performed_at'];
            }
            if (isset($data['odometer_km'])) {
                $maintenance_event->odometer_km = (int) $data['odometer_km'];
            }
            if (isset($data['cost_mad'])) {
                $maintenance_event->cost_mad = (string) $data['cost_mad'];
            }
            if (isset($data['vendor'])) {
                $maintenance_event->vendor = $data['vendor'];
            }
            $maintenance_event->save();

            $vehicle = $maintenance_event->vehicle;
            if ($vehicle) {
                $this->ops->tryReleaseAfterWorkshop($vehicle);
            }
        });

        $fresh = $maintenance_event->fresh();
        AuditLogger::updated($fresh, $request->user(), before: [], after: [], request: $request);

        return ApiResponse::success($fresh);
    }
}
