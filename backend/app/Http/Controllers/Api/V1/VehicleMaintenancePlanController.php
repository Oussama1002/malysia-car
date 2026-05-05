<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleMaintenancePlan;
use App\Services\MaintenanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VehicleMaintenancePlanController extends Controller
{
    public function __construct(private MaintenanceService $svc) {}

    /** GET /vehicles/{vehicle}/maintenance-plans */
    public function index(Vehicle $vehicle): JsonResponse
    {
        $plans = $this->svc->duePlans($vehicle);

        return ApiResponse::success($plans);
    }

    /** POST /vehicles/{vehicle}/maintenance-plans */
    public function store(Request $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validate([
            'maintenance_type' => ['required', 'string', 'max:50'],
            'interval_km'      => ['nullable', 'integer', 'min:100', 'max:500000'],
            'interval_months'  => ['nullable', 'integer', 'min:1', 'max:120'],
            'last_done_at'     => ['nullable', 'date'],
            'notes'            => ['nullable', 'string', 'max:500'],
        ]);

        $plan = $this->svc->createPlan($vehicle, $data);

        return ApiResponse::success($this->formatPlan($plan), null, null, 201);
    }

    /** PUT /maintenance-plans/{plan} */
    public function update(Request $request, VehicleMaintenancePlan $plan): JsonResponse
    {
        $data = $request->validate([
            'maintenance_type' => ['sometimes', 'string', 'max:50'],
            'interval_km'      => ['sometimes', 'nullable', 'integer', 'min:100', 'max:500000'],
            'interval_months'  => ['sometimes', 'nullable', 'integer', 'min:1', 'max:120'],
            'last_done_at'     => ['sometimes', 'nullable', 'date'],
            'next_due_at'      => ['sometimes', 'nullable', 'date'],
            'next_due_km'      => ['sometimes', 'nullable', 'integer', 'min:0'],
            'is_active'        => ['sometimes', 'boolean'],
            'notes'            => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $plan->update($data);

        return ApiResponse::success($this->formatPlan($plan->fresh()));
    }

    /** DELETE /maintenance-plans/{plan} */
    public function destroy(VehicleMaintenancePlan $plan): JsonResponse
    {
        $plan->delete();

        return ApiResponse::message('Plan supprimé.');
    }

    /** @return array<string, mixed> */
    private function formatPlan(VehicleMaintenancePlan $p): array
    {
        return [
            'id'              => $p->id,
            'vehicleId'       => $p->vehicle_id,
            'type'            => $p->maintenance_type,
            'intervalKm'      => $p->interval_km,
            'intervalMonths'  => $p->interval_months,
            'lastDoneAt'      => $p->last_done_at?->toDateString(),
            'nextDueAt'       => $p->next_due_at?->toDateString(),
            'nextDueKm'       => $p->next_due_km,
            'status'          => $p->status,
            'isActive'        => $p->is_active,
            'notes'           => $p->notes,
        ];
    }
}
