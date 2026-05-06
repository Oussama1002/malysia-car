<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleMovement;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class VehicleMovementController extends Controller
{
    public function index(Vehicle $vehicle): JsonResponse
    {
        $rows = VehicleMovement::query()
            ->where('vehicle_id', $vehicle->id)
            ->orderByDesc('performed_at')
            ->limit(200)
            ->get();

        return ApiResponse::success($rows);
    }

    public function entry(Request $request, Vehicle $vehicle): JsonResponse
    {
        return $this->storeMovement($request, $vehicle, 'entry');
    }

    public function exit(Request $request, Vehicle $vehicle): JsonResponse
    {
        return $this->storeMovement($request, $vehicle, 'exit');
    }

    public function returnMovement(Request $request, Vehicle $vehicle): JsonResponse
    {
        return $this->storeMovement($request, $vehicle, 'return');
    }

    /**
     * @param 'entry'|'exit'|'return'|'transfer'|'immobilization'|'release' $type
     */
    private function storeMovement(Request $request, Vehicle $vehicle, string $type): JsonResponse
    {
        $data = $request->validate([
            'related_type' => ['nullable', 'string', 'max:80'],
            'related_id' => ['nullable', 'string', 'max:36'],
            'branch_from_id' => ['nullable', 'uuid'],
            'branch_to_id' => ['nullable', 'uuid'],
            'customer_id' => ['nullable', 'uuid'],
            'odometer_km' => ['nullable', 'numeric', 'min:0'],
            'fuel_level' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'condition_notes' => ['nullable', 'string'],
            'performed_at' => ['nullable', 'date'],
            'signature_file_id' => ['nullable', 'uuid'],
            'report_file_id' => ['nullable', 'uuid'],
            'current_location' => ['nullable', 'string', 'max:500'],
        ]);

        $movement = DB::transaction(function () use ($vehicle, $data, $type, $request) {
            $m = VehicleMovement::query()->create([
                'id' => (string) Str::uuid(),
                'vehicle_id' => $vehicle->id,
                'movement_type' => $type,
                'related_type' => $data['related_type'] ?? null,
                'related_id' => $data['related_id'] ?? null,
                'branch_from_id' => $data['branch_from_id'] ?? null,
                'branch_to_id' => $data['branch_to_id'] ?? null,
                'customer_id' => $data['customer_id'] ?? null,
                'odometer_km' => $data['odometer_km'] ?? null,
                'fuel_level' => $data['fuel_level'] ?? null,
                'condition_notes' => $data['condition_notes'] ?? null,
                'performed_by' => $request->user()?->id,
                'performed_at' => $data['performed_at'] ?? now(),
                'signature_file_id' => $data['signature_file_id'] ?? null,
                'report_file_id' => $data['report_file_id'] ?? null,
            ]);

            if (! empty($data['branch_to_id'])) {
                $vehicle->branch_id = $data['branch_to_id'];
            }
            if (! empty($data['current_location'])) {
                $vehicle->current_location = $data['current_location'];
            }
            if (isset($data['odometer_km'])) {
                $vehicle->mileage_current = (int) $data['odometer_km'];
            }
            $vehicle->save();

            return $m;
        });

        AuditLogger::created($movement, $request->user(), request: $request);

        return ApiResponse::success($movement, null, null, 201);
    }
}
