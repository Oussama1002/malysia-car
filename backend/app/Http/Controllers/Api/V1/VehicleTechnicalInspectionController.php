<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleTechnicalInspection;
use App\Services\AuditLogger;
use App\Services\ComplianceAlertService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class VehicleTechnicalInspectionController extends Controller
{
    public function __construct(private readonly ComplianceAlertService $complianceAlerts) {}

    public function index(Vehicle $vehicle): JsonResponse
    {
        $rows = VehicleTechnicalInspection::query()
            ->where('vehicle_id', $vehicle->id)
            ->orderByDesc('inspection_date')
            ->get();

        return ApiResponse::success($rows);
    }

    public function store(Request $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validate([
            'inspection_date' => ['required', 'date'],
            'expiry_date' => ['required', 'date', 'after_or_equal:inspection_date'],
            'center_name' => ['nullable', 'string', 'max:160'],
            'result' => ['required', 'in:passed,conditional,failed'],
            'defects' => ['nullable', 'array'],
            'document_file_id' => ['nullable', 'uuid'],
            'next_due_date' => ['nullable', 'date'],
        ]);

        $inspection = VehicleTechnicalInspection::query()->create([
            'id' => (string) Str::uuid(),
            'vehicle_id' => $vehicle->id,
            ...$data,
            'next_due_date' => $data['next_due_date'] ?? $data['expiry_date'],
        ]);

        $vehicle->update(['tech_control_expiry' => $inspection->expiry_date]);
        $this->complianceAlerts->syncVehicle($vehicle);
        AuditLogger::created($inspection, $request->user(), request: $request);

        return ApiResponse::success($inspection->fresh(), null, null, 201);
    }

    public function update(Request $request, VehicleTechnicalInspection $inspection): JsonResponse
    {
        $data = $request->validate([
            'inspection_date' => ['sometimes', 'date'],
            'expiry_date' => ['sometimes', 'date'],
            'center_name' => ['sometimes', 'nullable', 'string', 'max:160'],
            'result' => ['sometimes', 'in:passed,conditional,failed'],
            'defects' => ['sometimes', 'nullable', 'array'],
            'document_file_id' => ['sometimes', 'nullable', 'uuid'],
            'next_due_date' => ['sometimes', 'nullable', 'date'],
        ]);

        $before = $inspection->getOriginal();
        $inspection->update($data);
        $vehicle = $inspection->vehicle;
        if ($vehicle) {
            $latestExpiry = VehicleTechnicalInspection::query()
                ->where('vehicle_id', $vehicle->id)
                ->max('expiry_date');
            $vehicle->update(['tech_control_expiry' => $latestExpiry]);
            $this->complianceAlerts->syncVehicle($vehicle);
        }
        AuditLogger::updated($inspection, $request->user(), before: array_intersect_key($before, $inspection->getChanges()), after: $inspection->getChanges(), request: $request);

        return ApiResponse::success($inspection->fresh());
    }
}
