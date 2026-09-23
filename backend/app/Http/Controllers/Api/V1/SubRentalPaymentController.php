<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\SubRentalContract;
use App\Models\SubRentalPayment;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SubRentalPaymentController extends Controller
{
    public function index(string $contractId): JsonResponse
    {
        $contract = SubRentalContract::findOrFail($contractId);
        $payments = $contract->payments()->get();

        return ApiResponse::success([
            'payments'          => $payments,
            'total_paid'        => $contract->totalPaid(),
            'remaining_balance' => $contract->remainingBalance(),
            'payment_status'    => $contract->payment_status,
        ]);
    }

    public function store(Request $request, string $contractId): JsonResponse
    {
        $contract = SubRentalContract::findOrFail($contractId);

        if (in_array($contract->status, ['cancelled', 'closed'], true)) {
            return ApiResponse::error('Impossible d\'enregistrer un paiement sur un contrat clôturé ou annulé.', 422);
        }

        $data = $request->validate([
            'amount'         => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', 'in:cash,bank_transfer,cheque,card,other'],
            'payment_date'   => ['required', 'date'],
            'reference'      => ['nullable', 'string', 'max:100'],
            'check_number'   => ['nullable', 'string', 'max:60'],
            'check_bank'     => ['nullable', 'string', 'max:160'],
            'check_date'     => ['nullable', 'date'],
            'notes'          => ['nullable', 'string'],
            'cheque_document_id' => ['nullable', 'uuid'],
        ]);
        $chequeDocumentId = $data['cheque_document_id'] ?? null;
        unset($data['cheque_document_id']);

        if ($data['payment_method'] === 'cheque' && ! empty($data['check_number'])) {
            $message = \App\Support\ChequeRegistry::duplicateMessage(
                (string) $data['check_number'],
                $data['check_bank'] ?? null,
            );
            if ($message) {
                return ApiResponse::error($message, 422, ['check_number' => [$message]]);
            }
        }

        $payment = SubRentalPayment::create(array_merge($data, [
            'id'                     => (string) Str::uuid(),
            'sub_rental_contract_id' => $contract->id,
            'created_by'             => $request->user()->id,
        ]));

        app(\App\Services\ScanEvidenceService::class)->attach(
            $chequeDocumentId,
            'sub_rental_payment',
            $payment->id,
            $request->user(),
            title: 'Chèque '.($payment->check_number ?? ''),
        );

        AuditLogger::created($payment, $request->user(), ['contract_id' => $contract->id, 'amount' => (float) $payment->amount]);

        // Re-fetch contract to get updated payment_status
        $contract->refresh();

        return ApiResponse::success([
            'payment'           => $payment,
            'total_paid'        => $contract->totalPaid(),
            'remaining_balance' => $contract->remainingBalance(),
            'payment_status'    => $contract->payment_status,
        ], null, null, 201);
    }
}
