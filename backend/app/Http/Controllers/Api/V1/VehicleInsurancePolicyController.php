<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleInsurancePolicy;
use App\Services\AuditLogger;
use App\Services\ComplianceAlertService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class VehicleInsurancePolicyController extends Controller
{
    public function __construct(private readonly ComplianceAlertService $complianceAlerts) {}

    public function index(Vehicle $vehicle): JsonResponse
    {
        $rows = VehicleInsurancePolicy::query()
            ->where('vehicle_id', $vehicle->id)
            ->orderByDesc('end_date')
            ->get();

        return ApiResponse::success($rows);
    }

    public function store(Request $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validate([
            'insurer_name' => ['required', 'string', 'max:160'],
            'policy_number' => ['required', 'string', 'max:120'],
            'coverage_type' => ['nullable', 'string', 'max:80'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'premium_amount' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'in:draft,active,expired,cancelled'],
            'document_file_id' => ['nullable', 'uuid'],
        ]);

        $policy = VehicleInsurancePolicy::query()->create([
            'id' => (string) Str::uuid(),
            'vehicle_id' => $vehicle->id,
            ...$data,
            'status' => $data['status'] ?? 'active',
        ]);

        $vehicle->update(['insurance_expiry' => $policy->end_date]);
        $this->complianceAlerts->syncVehicle($vehicle);
        AuditLogger::created($policy, $request->user(), request: $request);

        return ApiResponse::success($policy->fresh(), null, null, 201);
    }

    public function update(Request $request, VehicleInsurancePolicy $policy): JsonResponse
    {
        $data = $request->validate([
            'insurer_name' => ['sometimes', 'string', 'max:160'],
            'policy_number' => ['sometimes', 'string', 'max:120'],
            'coverage_type' => ['sometimes', 'nullable', 'string', 'max:80'],
            'start_date' => ['sometimes', 'date'],
            'end_date' => ['sometimes', 'date'],
            'premium_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'status' => ['sometimes', 'in:draft,active,expired,cancelled'],
            'document_file_id' => ['sometimes', 'nullable', 'uuid'],
        ]);

        $before = $policy->getOriginal();
        $policy->update($data);
        $vehicle = $policy->vehicle;
        if ($vehicle) {
            $latestEndDate = VehicleInsurancePolicy::query()
                ->where('vehicle_id', $vehicle->id)
                ->max('end_date');
            $vehicle->update(['insurance_expiry' => $latestEndDate]);
            $this->complianceAlerts->syncVehicle($vehicle);
        }
        AuditLogger::updated($policy, $request->user(), before: array_intersect_key($before, $policy->getChanges()), after: $policy->getChanges(), request: $request);

        return ApiResponse::success($policy->fresh());
    }
}
