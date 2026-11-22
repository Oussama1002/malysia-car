<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AccountingAccount;
use App\Models\AccountingEntry;
use App\Models\AccountingEntryLine;
use App\Models\FiscalPeriod;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

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
    // Balance auxiliaire client (3421 détaillé par tiers)
    // Utilise third_party_id posé par le bridge sur les lignes 3421.
    // ==================================================================

    public function customerAuxiliaryBalance(Request $request): JsonResponse
    {
        $request->validate([
            'as_of' => ['nullable', 'date'],
            'customer_id' => ['nullable', 'uuid'],
            'account_code' => ['nullable', 'string'],
            'only_open' => ['nullable', 'boolean'],
        ]);

        $asOf = $request->query('as_of', now()->toDateString());
        $accountCode = $request->query('account_code', '3421');
        $customerId = $request->query('customer_id');
        $onlyOpen = filter_var($request->query('only_open', false), FILTER_VALIDATE_BOOLEAN);

        $q = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->leftJoin('customers as c', function ($j) {
                $j->on('l.third_party_id', '=', 'c.id')->where('l.third_party_type', '=', 'customer');
            })
            ->leftJoin('customer_individual_profiles as cip', 'c.id', '=', 'cip.customer_id')
            ->leftJoin('customer_company_profiles as ccp', 'c.id', '=', 'ccp.customer_id')
            ->where('e.status', 'posted')
            ->where('l.account_code', $accountCode)
            ->where('l.third_party_type', 'customer')
            ->whereNotNull('l.third_party_id')
            ->whereDate('e.entry_date', '<=', $asOf)
            ->select(
                'l.third_party_id as customer_id',
                'c.customer_code',
                'cip.first_name', 'cip.last_name',
                'ccp.trade_name', 'ccp.legal_name',
                DB::raw('SUM(l.debit) as total_debit'),
                DB::raw('SUM(l.credit) as total_credit'),
                DB::raw('COUNT(*) as line_count'),
            )
            ->groupBy(
                'l.third_party_id', 'c.customer_code',
                'cip.first_name', 'cip.last_name', 'ccp.trade_name', 'ccp.legal_name',
            );

        if ($customerId) {
            $q->where('l.third_party_id', $customerId);
        }

        $rows = $q->get()->map(function ($r) {
            $debit = (float) $r->total_debit;
            $credit = (float) $r->total_credit;
            $balance = round($debit - $credit, 2); // 3421 est un compte d'actif → solde débiteur = client doit
            $name = trim($r->trade_name ?? $r->legal_name ?? trim(($r->first_name ?? '') . ' ' . ($r->last_name ?? '')));
            return [
                'customer_id' => $r->customer_id,
                'customer_code' => $r->customer_code,
                'customer_name' => $name ?: '(inconnu)',
                'total_debit' => round($debit, 2),
                'total_credit' => round($credit, 2),
                'balance' => $balance,
                'line_count' => (int) $r->line_count,
            ];
        });

        if ($onlyOpen) {
            $rows = $rows->filter(fn ($r) => abs($r['balance']) >= 0.01)->values();
        }

        return ApiResponse::success([
            'as_of' => $asOf,
            'account_code' => $accountCode,
            'customers' => $rows->values(),
            'totals' => [
                'total_debit' => round($rows->sum('total_debit'), 2),
                'total_credit' => round($rows->sum('total_credit'), 2),
                'total_balance' => round($rows->sum('balance'), 2),
                'customer_count' => $rows->count(),
            ],
        ]);
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
        $equity = collect($section('equity')->all());

        // Résultat de l'exercice : produits - charges (postés) jusqu'à as_of
        // Ajouté en ligne synthétique dans Capitaux propres pour équilibrer le bilan
        // tant que les écritures de clôture n'ont pas été passées.
        $pl = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->join('accounting_accounts as a', 'l.account_code', '=', 'a.code')
            ->where('e.status', 'posted')
            ->whereDate('e.entry_date', '<=', $asOf)
            ->whereIn('a.account_type', ['income', 'expense'])
            ->select('a.account_type', 'a.normal_balance', DB::raw('SUM(l.debit) as d'), DB::raw('SUM(l.credit) as c'))
            ->groupBy('a.account_type', 'a.normal_balance')
            ->get();
        $income = 0.0;
        $expense = 0.0;
        foreach ($pl as $row) {
            $delta = ($row->normal_balance === 'credit') ? ((float) $row->c - (float) $row->d) : ((float) $row->d - (float) $row->c);
            if ($row->account_type === 'income') {
                $income += $delta;
            } else {
                $expense += $delta;
            }
        }
        $netIncome = round($income - $expense, 2);
        if (abs($netIncome) >= 0.01) {
            $equity->push([
                'code' => '1191',
                'name' => "Résultat net de l'exercice",
                'parent_code' => null,
                'balance' => $netIncome,
            ]);
        }

        $equityTotal = $equity->sum('balance');

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
                'lines' => $equity->values(),
                'total' => round($equityTotal, 2),
            ],
            'total_liabilities_equity' => round($liabilities->sum('balance') + $equityTotal, 2),
            'is_balanced' => abs($assets->sum('balance') - $liabilities->sum('balance') - $equityTotal) < 0.01,
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

    // ==================================================================
    // Export FEC (Fichier des Écritures Comptables) — DGFiP / DGI Maroc
    // Pipe-delimited UTF-8, 18 colonnes, uniquement les écritures postées.
    // ==================================================================

    public function exportFec(Request $request): StreamedResponse
    {
        $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);
        $from = $request->query('from');
        $to = $request->query('to');

        $filename = sprintf('FEC_%s_%s.txt', str_replace('-', '', $from), str_replace('-', '', $to));

        // Regulatory traceability: FEC exports must be auditable.
        AuditLogger::record(
            action: 'fec.export',
            user: $request->user(),
            entityType: 'accounting_entries',
            entityId: null,
            after: ['from' => $from, 'to' => $to, 'filename' => $filename],
            module: 'accounting',
            legal: true,
            request: $request,
            label: 'Export FEC',
        );

        return new StreamedResponse(function () use ($from, $to) {
            $out = fopen('php://output', 'w');
            fwrite($out, implode('|', [
                'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
                'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
                'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
                'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
            ]) . "\n");

            DB::table('accounting_entry_lines as l')
                ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
                ->join('accounting_journals as j', 'e.journal_id', '=', 'j.id')
                ->leftJoin('accounting_accounts as a', 'l.account_code', '=', 'a.code')
                ->leftJoin('customers as c', function ($join) {
                    $join->on('l.third_party_id', '=', 'c.id')
                        ->where('l.third_party_type', '=', 'customer');
                })
                ->leftJoin('customer_individual_profiles as cip', 'c.id', '=', 'cip.customer_id')
                ->leftJoin('customer_company_profiles as ccp', 'c.id', '=', 'ccp.customer_id')
                ->where('e.status', 'posted')
                ->whereDate('e.entry_date', '>=', $from)
                ->whereDate('e.entry_date', '<=', $to)
                ->orderBy('e.entry_date')
                ->orderBy('e.entry_number')
                ->orderBy('l.line_order')
                ->select([
                    'j.code as journal_code', 'j.name as journal_name',
                    'e.entry_number', 'e.entry_date', 'e.reference', 'e.description', 'e.posted_at', 'e.currency_code',
                    'l.account_code', 'l.label as line_label', 'l.debit', 'l.credit',
                    'l.third_party_type', 'l.third_party_id',
                    'a.name as account_name',
                    'c.customer_code as c_code',
                    'cip.first_name as c_first', 'cip.last_name as c_last',
                    'ccp.trade_name as c_trade', 'ccp.legal_name as c_legal',
                ])
                ->chunk(500, function ($rows) use ($out) {
                    foreach ($rows as $r) {
                        $auxNum = '';
                        $auxLib = '';
                        if ($r->third_party_type === 'customer' && $r->c_code) {
                            $auxNum = $r->c_code;
                            $auxLib = trim(($r->c_trade ?? $r->c_legal ?? trim(($r->c_first ?? '') . ' ' . ($r->c_last ?? ''))));
                        } elseif ($r->third_party_id) {
                            $auxNum = $r->third_party_id;
                        }
                        $cells = [
                            $this->fec($r->journal_code),
                            $this->fec($r->journal_name),
                            $this->fec($r->entry_number),
                            $this->fecDate($r->entry_date),
                            $this->fec($r->account_code),
                            $this->fec($r->account_name ?? ''),
                            $this->fec($auxNum),
                            $this->fec($auxLib),
                            $this->fec($r->reference ?? ''),
                            $this->fecDate($r->entry_date),
                            $this->fec($r->description . ' — ' . $r->line_label),
                            $this->fecAmount($r->debit),
                            $this->fecAmount($r->credit),
                            '',
                            '',
                            $this->fecDate($r->posted_at ?? $r->entry_date),
                            '',
                            $this->fec($r->currency_code ?? 'MAD'),
                        ];
                        fwrite($out, implode('|', $cells) . "\n");
                    }
                });
            fclose($out);
        }, Response::HTTP_OK, [
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    private function fec(?string $v): string
    {
        return str_replace(['|', "\n", "\r", "\t"], ' ', (string) $v);
    }

    private function fecDate(?string $d): string
    {
        if (! $d) return '';
        $t = strtotime($d);
        return $t ? date('Ymd', $t) : '';
    }

    private function fecAmount($v): string
    {
        return number_format((float) $v, 2, ',', '');
    }
}
