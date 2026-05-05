<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AccountingAccount;
use App\Models\AccountingEntry;
use App\Models\AccountingEntryLine;
use App\Models\FiscalPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AccountingReportController extends Controller
{
    // ==================================================================
    // Grand Livre (General Ledger)
    // ==================================================================

    public function generalLedger(Request $request): JsonResponse
    {
        $request->validate([
            'account_code' => ['nullable', 'string'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'fiscal_period_id' => ['nullable', 'uuid'],
        ]);

        $q = AccountingEntryLine::query()
            ->join('accounting_entries', 'accounting_entry_lines.entry_id', '=', 'accounting_entries.id')
            ->where('accounting_entries.status', 'posted')
            ->select(
                'accounting_entry_lines.*',
                'accounting_entries.entry_number',
                'accounting_entries.entry_date',
                'accounting_entries.description as entry_description',
                'accounting_entries.reference',
            )
            ->orderBy('accounting_entries.entry_date')
            ->orderBy('accounting_entries.entry_number');

        if ($code = $request->query('account_code')) {
            $q->where('accounting_entry_lines.account_code', $code);
        }
        if ($from = $request->query('from')) {
            $q->whereDate('accounting_entries.entry_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->whereDate('accounting_entries.entry_date', '<=', $to);
        }
        if ($period = $request->query('fiscal_period_id')) {
            $q->where('accounting_entries.fiscal_period_id', $period);
        }

        $lines = $q->get();

        // Build running balance per account
        $byAccount = $lines->groupBy('account_code');
        $result = $byAccount->map(function ($accountLines, $code) {
            $account = AccountingAccount::where('code', $code)->first();
            $balance = (float) ($account?->opening_balance ?? 0);
            $normalDebit = ($account?->normal_balance ?? 'debit') === 'debit';

            $entries = $accountLines->map(function ($line) use (&$balance, $normalDebit) {
                $debit = (float) $line->debit;
                $credit = (float) $line->credit;
                $balance += $normalDebit ? ($debit - $credit) : ($credit - $debit);

                return [
                    'entry_number' => $line->entry_number,
                    'entry_date' => $line->entry_date,
                    'description' => $line->label,
                    'reference' => $line->reference,
                    'debit' => $debit,
                    'credit' => $credit,
                    'running_balance' => round($balance, 2),
                ];
            });

            return [
                'account_code' => $code,
                'account_name' => $account?->name ?? $code,
                'account_type' => $account?->account_type ?? '?',
                'opening_balance' => (float) ($account?->opening_balance ?? 0),
                'total_debit' => round($accountLines->sum('debit'), 2),
                'total_credit' => round($accountLines->sum('credit'), 2),
                'closing_balance' => round($balance, 2),
                'entries' => $entries->values(),
            ];
        })->values();

        return ApiResponse::success($result);
    }

    // ==================================================================
    // Balance générale / Trial balance
    // ==================================================================

    public function trialBalance(Request $request): JsonResponse
    {
        $from = $request->query('from');
        $to = $request->query('to');
        $periodId = $request->query('fiscal_period_id');

        $q = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->where('e.status', 'posted')
            ->select(
                'l.account_code',
                DB::raw('SUM(l.debit) as total_debit'),
                DB::raw('SUM(l.credit) as total_credit'),
            )
            ->groupBy('l.account_code');

        if ($from) {
            $q->whereDate('e.entry_date', '>=', $from);
        }
        if ($to) {
            $q->whereDate('e.entry_date', '<=', $to);
        }
        if ($periodId) {
            $q->where('e.fiscal_period_id', $periodId);
        }

        $rows = $q->orderBy('l.account_code')->get();
        $accounts = AccountingAccount::all()->keyBy('code');

        $lines = $rows->map(function ($row) use ($accounts) {
            $acc = $accounts->get($row->account_code);
            $opening = (float) ($acc?->opening_balance ?? 0);
            $debit = (float) $row->total_debit;
            $credit = (float) $row->total_credit;
            $normalDebit = ($acc?->normal_balance ?? 'debit') === 'debit';
            $balance = $normalDebit
                ? $opening + $debit - $credit
                : $opening + $credit - $debit;

            return [
                'account_code' => $row->account_code,
                'account_name' => $acc?->name ?? $row->account_code,
                'account_type' => $acc?->account_type ?? '?',
                'opening_balance' => $opening,
                'period_debit' => round($debit, 2),
                'period_credit' => round($credit, 2),
                'closing_balance' => round($balance, 2),
                'debit_balance' => $balance > 0 && ($acc?->normal_balance ?? 'debit') === 'debit' ? round($balance, 2) : 0,
                'credit_balance' => $balance > 0 && ($acc?->normal_balance ?? 'credit') === 'credit' ? round($balance, 2) : 0,
            ];
        });

        $totals = [
            'total_debit' => round($lines->sum('period_debit'), 2),
            'total_credit' => round($lines->sum('period_credit'), 2),
            'is_balanced' => abs($lines->sum('period_debit') - $lines->sum('period_credit')) < 0.01,
        ];

        return ApiResponse::success(['lines' => $lines, 'totals' => $totals]);
    }

    // ==================================================================
    // Balance sheet (Bilan)
    // ==================================================================

    public function balanceSheet(Request $request): JsonResponse
    {
        $asOf = $request->query('as_of', now()->toDateString());

        $q = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->join('accounting_accounts as a', 'l.account_code', '=', 'a.code')
            ->where('e.status', 'posted')
            ->whereDate('e.entry_date', '<=', $asOf)
            ->whereIn('a.account_type', ['asset', 'liability', 'equity'])
            ->select(
                'a.code', 'a.name', 'a.account_type', 'a.normal_balance',
                'a.opening_balance', 'a.parent_code',
                DB::raw('SUM(l.debit) as total_debit'),
                DB::raw('SUM(l.credit) as total_credit'),
            )
            ->groupBy('a.code', 'a.name', 'a.account_type', 'a.normal_balance', 'a.opening_balance', 'a.parent_code')
            ->orderBy('a.code')
            ->get();

        $section = function (string $type) use ($q) {
            return $q->filter(fn ($r) => $r->account_type === $type)->map(function ($r) {
                $opening = (float) $r->opening_balance;
                $debit = (float) $r->total_debit;
                $credit = (float) $r->total_credit;
                $balance = ($r->normal_balance === 'debit')
                    ? $opening + $debit - $credit
                    : $opening + $credit - $debit;

                return [
                    'code' => $r->code,
                    'name' => $r->name,
                    'parent_code' => $r->parent_code,
                    'balance' => round($balance, 2),
                ];
            })->values();
        };

        $assets = $section('asset');
        $liabilities = $section('liability');
        $equity = $section('equity');

        return ApiResponse::success([
            'as_of' => $asOf,
            'assets' => [
                'lines' => $assets,
                'total' => round($assets->sum('balance'), 2),
            ],
            'liabilities' => [
                'lines' => $liabilities,
                'total' => round($liabilities->sum('balance'), 2),
            ],
            'equity' => [
                'lines' => $equity,
                'total' => round($equity->sum('balance'), 2),
            ],
            'total_liabilities_equity' => round($liabilities->sum('balance') + $equity->sum('balance'), 2),
            'is_balanced' => abs($assets->sum('balance') - $liabilities->sum('balance') - $equity->sum('balance')) < 0.01,
        ]);
    }

    // ==================================================================
    // Income statement (P&L / CPC)
    // ==================================================================

    public function incomeStatement(Request $request): JsonResponse
    {
        $from = $request->query('from', now()->startOfYear()->toDateString());
        $to = $request->query('to', now()->toDateString());

        $q = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->join('accounting_accounts as a', 'l.account_code', '=', 'a.code')
            ->where('e.status', 'posted')
            ->whereDate('e.entry_date', '>=', $from)
            ->whereDate('e.entry_date', '<=', $to)
            ->whereIn('a.account_type', ['income', 'expense'])
            ->select(
                'a.code', 'a.name', 'a.account_type', 'a.normal_balance', 'a.parent_code',
                DB::raw('SUM(l.debit) as total_debit'),
                DB::raw('SUM(l.credit) as total_credit'),
            )
            ->groupBy('a.code', 'a.name', 'a.account_type', 'a.normal_balance', 'a.parent_code')
            ->orderBy('a.code')
            ->get();

        $mapLines = fn (string $type) => $q->filter(fn ($r) => $r->account_type === $type)->map(function ($r) {
            $debit = (float) $r->total_debit;
            $credit = (float) $r->total_credit;
            $balance = ($r->normal_balance === 'credit')
                ? $credit - $debit  // income
                : $debit - $credit; // expense

            return [
                'code' => $r->code,
                'name' => $r->name,
                'parent_code' => $r->parent_code,
                'amount' => round($balance, 2),
            ];
        })->values();

        $income = $mapLines('income');
        $expense = $mapLines('expense');
        $netIncome = round($income->sum('amount') - $expense->sum('amount'), 2);

        return ApiResponse::success([
            'from' => $from,
            'to' => $to,
            'income' => ['lines' => $income, 'total' => round($income->sum('amount'), 2)],
            'expense' => ['lines' => $expense, 'total' => round($expense->sum('amount'), 2)],
            'net_income' => $netIncome,
            'is_profitable' => $netIncome >= 0,
        ]);
    }

    // ==================================================================
    // TVA report
    // ==================================================================

    public function taxReport(Request $request): JsonResponse
    {
        $from = $request->query('from', now()->startOfMonth()->toDateString());
        $to = $request->query('to', now()->endOfMonth()->toDateString());

        $rows = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->join('taxes as t', 'l.tax_id', '=', 't.id')
            ->where('e.status', 'posted')
            ->whereDate('e.entry_date', '>=', $from)
            ->whereDate('e.entry_date', '<=', $to)
            ->whereNotNull('l.tax_id')
            ->select(
                't.code as tax_code',
                't.name as tax_name',
                't.rate as tax_rate',
                't.tax_type',
                DB::raw('SUM(l.tax_amount) as total_tax_amount'),
                DB::raw('COUNT(*) as line_count'),
            )
            ->groupBy('t.code', 't.name', 't.rate', 't.tax_type')
            ->orderBy('t.code')
            ->get();

        $totalTaxCollected = $rows->where('tax_type', 'vat')->sum('total_tax_amount');
        $totalWithholding = $rows->where('tax_type', 'withholding')->sum('total_tax_amount');

        return ApiResponse::success([
            'from' => $from,
            'to' => $to,
            'taxes' => $rows,
            'total_vat_collected' => round((float) $totalTaxCollected, 2),
            'total_withholding' => round((float) $totalWithholding, 2),
        ]);
    }
}
