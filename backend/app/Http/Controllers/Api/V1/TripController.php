<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Trip;
use App\Models\Vehicle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TripController extends Controller
{
    public function indexForVehicle(Request $request, Vehicle $vehicle): JsonResponse
    {
        $limit = min(500, max(1, (int) $request->query('limit', 100)));
        $rows = Trip::query()
            ->where('vehicle_id', $vehicle->id)
            ->orderByDesc('started_at')
            ->limit($limit)
            ->get();

        return ApiResponse::success($rows);
    }
}

