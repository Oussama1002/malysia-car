<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleRepair;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VehicleRepairController extends Controller
{
    /** GET /vehicles/{vehicle}/repairs */
    public function index(Vehicle $vehicle): JsonResponse
    {
        $repairs = VehicleRepair::query()
            ->where('vehicle_id', $vehicle->id)
            ->orderByDesc('reported_at')
            ->get()
            ->map(fn (VehicleRepair $r) => $this->format($r));

        return ApiResponse::success($repairs);
    }

    /** POST /vehicles/{vehicle}/repairs */
    public function store(Request $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validate([
            'repair_type'         => ['required', 'string', 'max:50'],
            'description'         => ['required', 'string', 'max:500'],
            'reported_at'         => ['nullable', 'date'],
            'started_at'          => ['nullable', 'date'],
            'completed_at'        => ['nullable', 'date'],
            'downtime_days'       => ['nullable', 'integer', 'min:0', 'max:365'],
            'cost_amount'         => ['nullable', 'numeric', 'min:0'],
            'vendor_name'         => ['nullable', 'string', 'max:100'],
            'status'              => ['nullable', 'in:reported,in_progress,completed,cancelled'],
            'linked_accident_id'  => ['nullable', 'integer', 'exists:vehicle_accidents,id'],
        ]);

        $repair = VehicleRepair::create([
            ...$data,
            'vehicle_id'  => $vehicle->id,
            'reported_at' => $data['reported_at'] ?? now(),
            'status'      => $data['status'] ?? 'reported',
            'created_by'  => auth()->id(),
        ]);

        // If repair started, put vehicle in maintenance
        if (in_array($repair->status, ['in_progress'])) {
            $vehicle->update(['status' => 'MAINTENANCE']);
        }

        AuditLogger::created($repair, $request->user(), request: $request);

        return ApiResponse::success($this->format($repair), null, null, 201);
    }

    /** PUT /repairs/{repair} */
    public function update(Request $request, VehicleRepair $repair): JsonResponse
    {
        $data = $request->validate([
            'repair_type'    => ['sometimes', 'string', 'max:50'],
            'description'    => ['sometimes', 'string', 'max:500'],
            'started_at'     => ['sometimes', 'nullable', 'date'],
            'completed_at'   => ['sometimes', 'nullable', 'date'],
            'downtime_days'  => ['sometimes', 'nullable', 'integer', 'min:0', 'max:365'],
            'cost_amount'    => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'vendor_name'    => ['sometimes', 'nullable', 'string', 'max:100'],
            'status'         => ['sometimes', 'in:reported,in_progress,completed,cancelled'],
        ]);

        $before = $repair->getOriginal();
        $repair->update($data);
        AuditLogger::updated($repair, $request->user(), before: array_intersect_key($before, $repair->getChanges()), after: $repair->getChanges(), request: $request);

        // If completed, make vehicle available again (unless there's another active repair)
        if (($data['status'] ?? null) === 'completed') {
            $activeRepairs = VehicleRepair::query()
                ->where('vehicle_id', $repair->vehicle_id)
                ->where('id', '!=', $repair->id)
                ->whereIn('status', ['reported', 'in_progress'])
                ->exists();

            if (!$activeRepairs) {
                $repair->vehicle?->update(['status' => 'AVAILABLE']);
            }
        }

        return ApiResponse::success($this->format($repair->fresh()));
    }

    /** @return array<string, mixed> */
    private function format(VehicleRepair $r): array
    {
        return [
            'id'               => $r->id,
            'vehicleId'        => $r->vehicle_id,
            'repairType'       => $r->repair_type,
            'description'      => $r->description,
            'reportedAt'       => $r->reported_at?->toIso8601String(),
            'startedAt'        => $r->started_at?->toIso8601String(),
            'completedAt'      => $r->completed_at?->toIso8601String(),
            'downtimeDays'     => $r->computed_downtime_days,
            'costAmount'       => $r->cost_amount !== null ? (float) $r->cost_amount : null,
            'vendorName'       => $r->vendor_name,
            'status'           => $r->status,
            'linkedAccidentId' => $r->linked_accident_id,
        ];
    }
}
