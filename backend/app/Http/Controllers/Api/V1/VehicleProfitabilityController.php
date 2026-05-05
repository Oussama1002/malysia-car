<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Services\VehicleCostService;
use Illuminate\Http\JsonResponse;

class VehicleProfitabilityController extends Controller
{
    public function __construct(private VehicleCostService $costSvc) {}

    public function show(Vehicle $vehicle): JsonResponse
    {
        $summary = $this->costSvc->summary($vehicle);

        return ApiResponse::success([
            'vehicleId'      => $vehicle->id,
            'currency'       => 'MAD',
            'costs'          => $summary['costs'],
            'revenue'        => $summary['revenue'],
            'grossMargin'    => $summary['gross_margin'],
            'marginPct'      => $summary['margin_pct'],
            'purchaseCost'   => $summary['purchase_cost'],
            'bookValue'      => $summary['book_value'],
            'downtimeDays'   => $summary['downtime_days'],
            'contractsCount' => $summary['contracts_count'],
        ]);
    }
}
