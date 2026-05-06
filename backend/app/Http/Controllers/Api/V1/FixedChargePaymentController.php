<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\FixedChargePayment;
use App\Services\AuditLogger;
use App\Services\FixedChargeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FixedChargePaymentController extends Controller
{
    public function __construct(private readonly FixedChargeService $svc) {}

    public function markPaid(Request $request, FixedChargePayment $fixedChargePayment): JsonResponse
    {
        $data = $request->validate([
            'payment_method' => ['nullable', 'string', 'max:40'],
            'post_accounting' => ['sometimes', 'boolean'],
        ]);

        $payment = $this->svc->markPaid(
            $fixedChargePayment,
            $data['payment_method'] ?? null,
            (bool) ($data['post_accounting'] ?? false),
            $request->user()?->id,
        );

        AuditLogger::updated($payment, $request->user(), before: [], after: $payment->getAttributes(), request: $request);

        return ApiResponse::success($payment->load('accountingEntry'));
    }
}
