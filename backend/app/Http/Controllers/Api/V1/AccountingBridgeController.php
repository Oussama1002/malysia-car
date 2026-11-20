<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\DepreciationLine;
use App\Models\FixedAsset;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\AccountingBridgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AccountingBridgeController extends Controller
{
    public function __construct(private readonly AccountingBridgeService $bridge) {}

    public function fromInvoice(Request $request, Invoice $invoice): JsonResponse
    {
        try {
            $entry = $this->bridge->fromInvoice($invoice, optional($request->user())->id);
        } catch (RuntimeException $e) {
            return ApiResponse::message($e->getMessage(), 422);
        }
        return ApiResponse::success($entry, null, null, 201);
    }

    public function fromPayment(Request $request, Payment $payment): JsonResponse
    {
        try {
            $entry = $this->bridge->fromPayment($payment, optional($request->user())->id);
        } catch (RuntimeException $e) {
            return ApiResponse::message($e->getMessage(), 422);
        }
        return ApiResponse::success($entry, null, null, 201);
    }

    public function fromDepreciation(Request $request, DepreciationLine $depreciationLine): JsonResponse
    {
        try {
            $entry = $this->bridge->fromDepreciation($depreciationLine, optional($request->user())->id);
        } catch (RuntimeException $e) {
            return ApiResponse::message($e->getMessage(), 422);
        }
        return ApiResponse::success($entry, null, null, 201);
    }

    public function fromAssetDisposal(Request $request, FixedAsset $fixedAsset): JsonResponse
    {
        try {
            $entry = $this->bridge->fromAssetDisposal($fixedAsset, optional($request->user())->id);
        } catch (RuntimeException $e) {
            return ApiResponse::message($e->getMessage(), 422);
        }
        return ApiResponse::success($entry, null, null, 201);
    }
}
