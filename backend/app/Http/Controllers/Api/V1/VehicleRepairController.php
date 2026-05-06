<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleRepair;
use App\Services\AuditLogger;
use App\Services\VehicleOperationalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VehicleRepairController extends Controller
{
    public function __construct(private readonly VehicleOperationalService $ops) {}

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

        if (in_array($repair->status, ['in_progress'], true)) {
            $vehicle->update(['status' => 'MAINTENANCE']);
            $this->ops->markUnavailable($vehicle, 'unavailable', 'repair', 'Réparation: '.$repair->repair_type);
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
                $v = $repair->vehicle;
                if ($v) {
                    $this->ops->tryReleaseAfterWorkshop($v);
                }
            }
        }

        return ApiResponse::success($this->format($repair->fresh()));
    }

    public function start(Request $request, VehicleRepair $repair): JsonResponse
    {
        DB::transaction(function () use ($repair): void {
            $repair->status = 'in_progress';
            $repair->started_at = $repair->started_at ?? now();
            $repair->save();

            $vehicle = $repair->vehicle;
            if ($vehicle) {
                $vehicle->update(['status' => 'MAINTENANCE']);
                $this->ops->markUnavailable($vehicle, 'unavailable', 'repair', 'Réparation: '.$repair->repair_type);
            }
        });

        AuditLogger::updated($repair->fresh(), $request->user(), before: [], after: [], request: $request);

        return ApiResponse::success($this->format($repair->fresh()));
    }

    public function complete(Request $request, VehicleRepair $repair): JsonResponse
    {
        $data = $request->validate([
            'completed_at' => ['nullable', 'date'],
            'cost_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($repair, $data): void {
            $repair->status = 'completed';
            $repair->completed_at = $data['completed_at'] ?? now();
            if (isset($data['cost_amount'])) {
                $repair->cost_amount = $data['cost_amount'];
            }
            $repair->save();

            $activeRepairs = VehicleRepair::query()
                ->where('vehicle_id', $repair->vehicle_id)
                ->where('id', '!=', $repair->id)
                ->whereIn('status', ['reported', 'in_progress'])
                ->exists();

            if (! $activeRepairs && $repair->vehicle) {
                $this->ops->tryReleaseAfterWorkshop($repair->vehicle);
            }
        });

        AuditLogger::updated($repair->fresh(), $request->user(), before: [], after: [], request: $request);

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
