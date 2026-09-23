<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Contract;
use App\Models\ContractDeposit;
use App\Models\Reservation;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Franchise d'assurance — held as a guarantee, settled at the return.
 * Deliberately outside the payment flow: none of this is an encaissement.
 */
class ContractDepositController extends Controller
{
    /** Deposits of a reservation, or of the contract it is linked to. */
    public function index(Request $request, Reservation $reservation): JsonResponse
    {
        return ApiResponse::success($this->forReservation($reservation)->get());
    }

    public function store(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'method' => ['required', 'in:cash,cheque,bank_transfer,card,other'],
            'check_number' => ['nullable', 'string', 'max:60'],
            'check_bank' => ['nullable', 'string', 'max:160'],
            'check_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'cheque_document_id' => ['nullable', 'uuid'],
        ]);

        $contract = Contract::query()
            ->where('reservation_id', $reservation->id)
            ->whereNotIn('status', ['cancelled', 'rejected', 'expired'])
            ->orderByDesc('created_at')
            ->first();

        $deposit = ContractDeposit::query()->create([
            'company_id' => $reservation->company_id,
            'branch_id' => $reservation->branch_id,
            'contract_id' => $contract?->id,
            'reservation_id' => $reservation->id,
            'customer_id' => $reservation->customer_id,
            'amount' => $data['amount'],
            'method' => $data['method'],
            'check_number' => $data['method'] === 'cheque' ? ($data['check_number'] ?? null) : null,
            'check_bank' => $data['method'] === 'cheque' ? ($data['check_bank'] ?? null) : null,
            'check_date' => $data['method'] === 'cheque' ? ($data['check_date'] ?? null) : null,
            'status' => ContractDeposit::STATUS_HELD,
            'notes' => $data['notes'] ?? null,
            'collected_by' => $request->user()?->id,
            'collected_at' => now(),
        ]);

        app(\App\Services\ScanEvidenceService::class)->attach(
            $data['cheque_document_id'] ?? null,
            'contract_deposit',
            $deposit->id,
            $request->user(),
            title: 'Chèque franchise '.($deposit->check_number ?? ''),
        );

        AuditLogger::created($deposit, $request->user(), [
            'reservation_id' => $reservation->id,
            'amount' => (float) $deposit->amount,
        ], module: 'rentals');

        return ApiResponse::success($deposit, null, null, 201);
    }

    /** Give the franchise back to the client — the vehicle came back fine. */
    public function release(Request $request, ContractDeposit $deposit): JsonResponse
    {
        return $this->settle($request, $deposit, ContractDeposit::STATUS_RETURNED);
    }

    /** Keep the franchise — damage, fuel, fine. */
    public function retain(Request $request, ContractDeposit $deposit): JsonResponse
    {
        return $this->settle($request, $deposit, ContractDeposit::STATUS_RETAINED);
    }

    private function settle(Request $request, ContractDeposit $deposit, string $status): JsonResponse
    {
        $data = $request->validate([
            'notes' => [$status === ContractDeposit::STATUS_RETAINED ? 'required' : 'nullable', 'string', 'max:2000'],
        ]);

        if (! $deposit->isHeld()) {
            return ApiResponse::error(
                $deposit->status === ContractDeposit::STATUS_RETURNED
                    ? 'Cette franchise a déjà été restituée au client.'
                    : 'Cette franchise a déjà été retenue.',
                422,
            );
        }

        $before = $deposit->getOriginal();
        $deposit->update([
            'status' => $status,
            'settlement_notes' => $data['notes'] ?? null,
            'settled_by' => $request->user()?->id,
            'settled_at' => now(),
        ]);

        AuditLogger::updated(
            $deposit,
            $request->user(),
            before: ['status' => $before['status'] ?? null],
            after: ['status' => $status],
            module: 'rentals',
            request: $request,
        );

        return ApiResponse::success($deposit->fresh());
    }

    /** @return \Illuminate\Database\Eloquent\Builder<ContractDeposit> */
    private function forReservation(Reservation $reservation)
    {
        return ContractDeposit::query()
            ->where('reservation_id', $reservation->id)
            ->orderByDesc('collected_at');
    }
}
