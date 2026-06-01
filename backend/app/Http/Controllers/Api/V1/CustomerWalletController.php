<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Customer;
use App\Services\AuditLogger;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Wallet / Avoir API for a customer.
 *
 * Routes:
 *   GET  /customers/{customer}/wallet           → show balance + recent transactions
 *   GET  /customers/{customer}/wallet/transactions → full transaction history (paginated)
 *   POST /customers/{customer}/wallet/adjust    → admin manual credit/debit with reason
 *   POST /customers/{customer}/wallet/apply     → apply wallet credit to a contract/reservation
 *   POST /customers/{customer}/wallet/preview-early-return → calculate early return credit (no side-effect)
 */
class CustomerWalletController extends Controller
{
    public function __construct(private readonly WalletService $wallet) {}

    // ──────────────────────────────────────────────────────────────────────────

    /** GET /customers/{customer}/wallet */
    public function show(Customer $customer): JsonResponse
    {
        $wallet = $this->wallet->getOrCreate($customer);
        $recent = $wallet->transactions()->limit(10)->get();

        return ApiResponse::success([
            'wallet_id'     => $wallet->id,
            'customer_id'   => $customer->id,
            'balance'       => (float) $wallet->balance,
            'currency_code' => $wallet->currency_code,
            'recent_transactions' => $this->formatTransactions($recent),
            'updated_at'    => $wallet->updated_at,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────

    /** GET /customers/{customer}/wallet/transactions */
    public function transactions(Request $request, Customer $customer): JsonResponse
    {
        $wallet = $this->wallet->getOrCreate($customer);

        $txs = $wallet->transactions()
            ->when($request->query('direction'), fn ($q, $d) => $q->where('direction', $d))
            ->when($request->query('type'),      fn ($q, $t) => $q->where('type', $t))
            ->paginate(20);

        return ApiResponse::success([
            'data'        => $this->formatTransactions($txs->items()),
            'total'       => $txs->total(),
            'per_page'    => $txs->perPage(),
            'current_page'=> $txs->currentPage(),
            'last_page'   => $txs->lastPage(),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────

    /**
     * POST /customers/{customer}/wallet/adjust
     *
     * Admin-only: manually credit or debit the wallet with a mandatory reason.
     * No cash refund path — only adjusts the avoir balance.
     */
    public function adjust(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'direction'   => ['required', 'in:credit,debit'],
            'amount'      => ['required', 'numeric', 'min:0.01', 'max:99999'],
            'reason'      => ['required', 'string', 'min:5', 'max:500'],
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        if ($data['direction'] === 'credit') {
            $tx = $this->wallet->credit(
                customer: $customer,
                amount: (float) $data['amount'],
                type: 'manual_credit',
                description: $data['description'] ?? 'Ajustement manuel (crédit)',
                reason: $data['reason'],
                performedBy: (string) auth()->id(),
            );
        } else {
            $tx = $this->wallet->debit(
                customer: $customer,
                amount: (float) $data['amount'],
                type: 'manual_debit',
                description: $data['description'] ?? 'Ajustement manuel (débit)',
                performedBy: (string) auth()->id(),
            );
            // Attach reason to the debit transaction (WalletService doesn't require it on debit)
            $tx->reason = $data['reason'];
            $tx->save();
        }

        AuditLogger::financialAction(
            subject: $customer,
            user: $request->user(),
            request: $request,
            label: 'Ajustement manuel du portefeuille client',
            extra: [
                'direction'    => $data['direction'],
                'amount'       => $data['amount'],
                'reason'       => $data['reason'],
                'balance_after'=> $tx->balance_after,
            ],
        );

        return ApiResponse::success($this->formatTransaction($tx), 201);
    }

    // ──────────────────────────────────────────────────────────────────────────

    /**
     * POST /customers/{customer}/wallet/apply
     *
     * Apply (debit) wallet credit toward a contract or reservation.
     * Partial usage allowed — remaining balance is kept.
     */
    public function apply(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'amount'         => ['required', 'numeric', 'min:0.01'],
            'reference_type' => ['required', 'in:contract,reservation'],
            'reference_id'   => ['required', 'string', 'uuid'],
            'description'    => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $type = $data['reference_type'] === 'contract'
            ? 'contract_applied'
            : 'reservation_applied';

        $tx = $this->wallet->debit(
            customer: $customer,
            amount: (float) $data['amount'],
            type: $type,
            referenceType: $data['reference_type'],
            referenceId: $data['reference_id'],
            description: $data['description'] ?? "Avoir appliqué sur {$data['reference_type']} {$data['reference_id']}",
            performedBy: (string) auth()->id(),
        );

        AuditLogger::financialAction(
            subject: $customer,
            user: $request->user(),
            request: $request,
            label: 'Application avoir portefeuille',
            extra: [
                'amount'         => $data['amount'],
                'reference_type' => $data['reference_type'],
                'reference_id'   => $data['reference_id'],
                'balance_after'  => $tx->balance_after,
            ],
        );

        return ApiResponse::success($this->formatTransaction($tx), 201);
    }

    // ──────────────────────────────────────────────────────────────────────────

    /**
     * POST /customers/{customer}/wallet/preview-early-return
     *
     * Read-only: given a contract_id and optional return_date, returns the
     * credit that would be applied. No side effects.
     */
    public function previewEarlyReturn(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'contract_id' => ['required', 'string', 'uuid'],
            'return_date' => ['sometimes', 'nullable', 'date'],
        ]);

        $contract = \App\Models\Contract::where('id', $data['contract_id'])
            ->where('customer_id', $customer->id)
            ->firstOrFail();

        $returnDate = isset($data['return_date']) ? new \DateTime($data['return_date']) : null;
        $credit = $this->wallet->calculateEarlyReturnCredit($contract, $returnDate);

        $endDate   = $contract->end_date ?? null;
        $retDate   = $returnDate ? $returnDate->format('Y-m-d') : now()->toDateString();
        $unusedDays = $endDate
            ? max(0, (int) \Carbon\Carbon::parse($retDate)->diffInDays($endDate, false))
            : 0;

        return ApiResponse::success([
            'contract_id'     => $contract->id,
            'contract_number' => $contract->contract_number,
            'planned_end_date'=> $endDate,
            'return_date'     => $retDate,
            'unused_days'     => $unusedDays,
            'monthly_payment' => (float) ($contract->monthly_payment ?? 0),
            'daily_rate'      => round((float) ($contract->monthly_payment ?? 0) / 30, 2),
            'credit_amount'   => $credit,
            'currency_code'   => 'MAD',
            'current_balance' => $this->wallet->balance($customer),
            'balance_after_credit' => round($this->wallet->balance($customer) + $credit, 2),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Formatters
    // ──────────────────────────────────────────────────────────────────────────

    private function formatTransactions(iterable $txs): array
    {
        return collect($txs)->map(fn ($tx) => $this->formatTransaction($tx))->values()->all();
    }

    private function formatTransaction(\App\Models\WalletTransaction $tx): array
    {
        return [
            'id'             => $tx->id,
            'direction'      => $tx->direction,
            'type'           => $tx->type,
            'type_label'     => $this->typeLabel($tx->type),
            'amount'         => (float) $tx->amount,
            'balance_after'  => (float) $tx->balance_after,
            'reference_type' => $tx->reference_type,
            'reference_id'   => $tx->reference_id,
            'description'    => $tx->description,
            'reason'         => $tx->reason,
            'performed_by'   => $tx->performed_by,
            'created_at'     => $tx->created_at,
        ];
    }

    private function typeLabel(string $type): string
    {
        return match ($type) {
            'early_return'         => 'Retour anticipé',
            'manual_credit'        => 'Crédit manuel',
            'manual_debit'         => 'Débit manuel',
            'reservation_applied'  => 'Appliqué sur réservation',
            'contract_applied'     => 'Appliqué sur contrat',
            default                => ucfirst(str_replace('_', ' ', $type)),
        };
    }
}
