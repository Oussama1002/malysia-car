<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\ContractInstallment;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TreasuryController extends Controller
{
    // ==================================================================
    // Summary dashboard
    // ==================================================================

    public function summary(Request $request): JsonResponse
    {
        $branchId = $request->query('branch_id');

        $accountsQuery = BankAccount::query()->where('is_active', true);
        if ($branchId) {
            $accountsQuery->where('branch_id', $branchId);
        }
        $accounts = $accountsQuery->get();

        $balancesByCurrency = $accounts->groupBy('currency_code')->map(function ($group) {
            return [
                'current_balance' => round($group->sum(fn ($a) => (float) $a->current_balance), 2),
                'opening_balance' => round($group->sum(fn ($a) => (float) $a->opening_balance), 2),
                'accounts_count' => $group->count(),
            ];
        });

        // Projected inflows — non-cancelled invoices with amount_due > 0 in next 30 days
        $inflowQuery = Invoice::query()
            ->whereIn('status', ['issued', 'partial', 'overdue'])
            ->where('amount_due', '>', 0);
        if ($branchId) {
            $inflowQuery->where('branch_id', $branchId);
        }

        $today = now()->toDateString();
        $in30 = now()->addDays(30)->toDateString();

        $projected30 = (clone $inflowQuery)
            ->whereBetween('due_date', [$today, $in30])
            ->sum('amount_due');

        $overdueInvoices = (clone $inflowQuery)
            ->whereDate('due_date', '<', $today)
            ->get(['id', 'invoice_number', 'customer_id', 'due_date', 'amount_due', 'total_amount']);

        $latePayments = $overdueInvoices->sum(fn ($i) => (float) $i->amount_due);

        // Expected installments in next 30 days (not yet invoiced view for cashflow)
        $projectedInstallments = ContractInstallment::query()
            ->whereIn('installment_status', ['pending', 'partial', 'overdue'])
            ->whereBetween('due_date', [$today, $in30])
            ->sum(DB::raw('COALESCE(total_due_amount, 0) - COALESCE(total_paid_amount, 0)'));

        // Recent payments (last 7 days)
        $recentPaymentsTotal = Payment::query()
            ->whereDate('payment_date', '>=', now()->subDays(7)->toDateString())
            ->sum('amount');

        return ApiResponse::success([
            'balances_by_currency' => $balancesByCurrency,
            'accounts' => $accounts,
            'projected_inflows_next_30d' => round((float) $projected30, 2),
            'projected_installments_next_30d' => round((float) $projectedInstallments, 2),
            'overdue_total' => round((float) $latePayments, 2),
            'overdue_invoices_count' => $overdueInvoices->count(),
            'recent_payments_7d' => round((float) $recentPaymentsTotal, 2),
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    // ==================================================================
    // Bank accounts
    // ==================================================================

    public function listAccounts(Request $request): JsonResponse
    {
        $q = BankAccount::query();
        if ($branch = $request->query('branch_id')) {
            $q->where('branch_id', $branch);
        }
        if (!is_null($active = $request->query('is_active'))) {
            $q->where('is_active', (bool) $active);
        }

        return ApiResponse::success($q->orderByDesc('is_primary')->orderBy('bank_name')->get());
    }

    public function storeAccount(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'uuid'],
            'account_name' => ['required', 'string', 'max:160'],
            'bank_name' => ['required', 'string', 'max:160'],
            'account_number' => ['nullable', 'string', 'max:60'],
            'iban' => ['nullable', 'string', 'max:40'],
            'swift_code' => ['nullable', 'string', 'max:20'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'opening_balance' => ['nullable', 'numeric'],
            'current_balance' => ['nullable', 'numeric'],
            'is_active' => ['nullable', 'boolean'],
            'is_primary' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string'],
        ]);

        $account = BankAccount::create(array_merge($data, [
            'id' => (string) Str::uuid(),
            'company_id' => optional($request->user())->company_id,
            'currency_code' => $data['currency_code'] ?? 'MAD',
            'is_active' => $data['is_active'] ?? true,
            'is_primary' => $data['is_primary'] ?? false,
            'current_balance' => $data['current_balance'] ?? $data['opening_balance'] ?? 0,
        ]));

        if (! empty($data['is_primary'])) {
            BankAccount::where('id', '!=', $account->id)->update(['is_primary' => false]);
        }

        return ApiResponse::success($account, null, null, 201);
    }

    public function updateAccount(Request $request, BankAccount $bankAccount): JsonResponse
    {
        $data = $request->validate([
            'account_name' => ['sometimes', 'string', 'max:160'],
            'bank_name' => ['sometimes', 'string', 'max:160'],
            'account_number' => ['nullable', 'string', 'max:60'],
            'iban' => ['nullable', 'string', 'max:40'],
            'swift_code' => ['nullable', 'string', 'max:20'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'opening_balance' => ['nullable', 'numeric'],
            'current_balance' => ['nullable', 'numeric'],
            'is_active' => ['nullable', 'boolean'],
            'is_primary' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string'],
        ]);
        $bankAccount->fill($data)->save();
        if (! empty($data['is_primary'])) {
            BankAccount::where('id', '!=', $bankAccount->id)->update(['is_primary' => false]);
        }

        return ApiResponse::success($bankAccount->fresh());
    }

    public function destroyAccount(BankAccount $bankAccount): JsonResponse
    {
        $bankAccount->delete();

        return ApiResponse::message('Bank account archived');
    }

    // ==================================================================
    // Bank transactions
    // ==================================================================

    public function listTransactions(Request $request, BankAccount $bankAccount): JsonResponse
    {
        $q = $bankAccount->transactions();
        if ($status = $request->query('reconciliation_status')) {
            $q->where('reconciliation_status', $status);
        }
        if ($type = $request->query('transaction_type')) {
            $q->where('transaction_type', $type);
        }
        if ($from = $request->query('from')) {
            $q->whereDate('value_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->whereDate('value_date', '<=', $to);
        }

        $per = min(200, max(1, (int) $request->query('per_page', 50)));

        return ApiResponse::paginated($q->orderByDesc('value_date')->paginate($per));
    }

    public function importTransactions(Request $request, BankAccount $bankAccount): JsonResponse
    {
        $data = $request->validate([
            'batch_id' => ['nullable', 'string', 'max:120'],
            'transactions' => ['required', 'array', 'min:1'],
            'transactions.*.transaction_type' => ['required', 'in:debit,credit'],
            'transactions.*.amount' => ['required', 'numeric', 'min:0'],
            'transactions.*.value_date' => ['required', 'date'],
            'transactions.*.posted_date' => ['nullable', 'date'],
            'transactions.*.description' => ['nullable', 'string'],
            'transactions.*.external_reference' => ['nullable', 'string', 'max:160'],
            'transactions.*.counterparty_name' => ['nullable', 'string', 'max:160'],
            'transactions.*.counterparty_iban' => ['nullable', 'string', 'max:40'],
            'transactions.*.raw_payload' => ['nullable', 'array'],
        ]);

        $batchId = $data['batch_id'] ?? ('IMP-' . now()->format('YmdHis') . '-' . strtoupper(Str::random(4)));
        $created = [];

        DB::transaction(function () use ($bankAccount, $data, $batchId, &$created) {
            foreach ($data['transactions'] as $row) {
                $tx = BankTransaction::create([
                    'id' => (string) Str::uuid(),
                    'bank_account_id' => $bankAccount->id,
                    'transaction_type' => $row['transaction_type'],
                    'amount' => $row['amount'],
                    'currency_code' => $bankAccount->currency_code ?? 'MAD',
                    'value_date' => $row['value_date'],
                    'posted_date' => $row['posted_date'] ?? $row['value_date'],
                    'description' => $row['description'] ?? null,
                    'external_reference' => $row['external_reference'] ?? null,
                    'counterparty_name' => $row['counterparty_name'] ?? null,
                    'counterparty_iban' => $row['counterparty_iban'] ?? null,
                    'reconciliation_status' => 'unmatched',
                    'import_batch_id' => $batchId,
                    'raw_payload' => $row['raw_payload'] ?? null,
                ]);
                $created[] = $tx;
            }
        });

        return ApiResponse::success([
            'batch_id' => $batchId,
            'created_count' => count($created),
            'transactions' => $created,
        ], null, null, 201);
    }

    public function matchTransaction(Request $request, BankTransaction $transaction): JsonResponse
    {
        $data = $request->validate([
            'payment_id' => ['nullable', 'uuid'],
            'action' => ['required', 'in:match,ignore,unmatch'],
        ]);

        if ($data['action'] === 'ignore') {
            $transaction->reconciliation_status = 'ignored';
            $transaction->matched_payment_id = null;
        } elseif ($data['action'] === 'unmatch') {
            $transaction->reconciliation_status = 'unmatched';
            $transaction->matched_payment_id = null;
        } else {
            if (empty($data['payment_id'])) {
                return ApiResponse::message('payment_id is required to match a transaction.', 422);
            }
            $transaction->matched_payment_id = $data['payment_id'];
            $transaction->reconciliation_status = 'matched';
        }
        $transaction->save();

        return ApiResponse::success($transaction);
    }
}
