<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\FleetAnalysisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FleetAnalysisController extends Controller
{
    public function __construct(private readonly FleetAnalysisService $svc) {}

    public function __invoke(Request $request): JsonResponse
    {
        $companyId = $request->user()?->company_id;

        return ApiResponse::success($this->svc->analyze($companyId));
    }
}
