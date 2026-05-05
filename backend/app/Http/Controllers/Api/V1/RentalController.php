<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\RentalAvailabilityService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RentalController extends Controller
{
    public function __construct(private readonly RentalAvailabilityService $availability) {}

    public function availability(Request $request): JsonResponse
    {
        $data = $request->validate([
            'vehicle_id' => ['required', 'uuid'],
            'start_at' => ['required', 'date'],
            'end_at' => ['required', 'date', 'after:start_at'],
            'ignore_reservation_id' => ['nullable', 'uuid'],
            'ignore_contract_id' => ['nullable', 'uuid'],
        ]);

        $result = $this->availability->checkVehicleAvailability(
            $data['vehicle_id'],
            Carbon::parse($data['start_at']),
            Carbon::parse($data['end_at']),
            $data['ignore_reservation_id'] ?? null,
            $data['ignore_contract_id'] ?? null
        );

        return ApiResponse::success($result);
    }
}

