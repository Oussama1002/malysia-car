<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\BankStatementLine;
use App\Models\Payment;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class BankReconciliationController extends Controller
{
    /**
     * GET /v1/bank-reconciliation
     * Liste paginée des lignes de relevé, filtrables par statut.
     */
    public function index(Request $request): JsonResponse
    {
        $q = BankStatementLine::query();
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($from = $request->query('from')) {
            $q->whereDate('value_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->whereDate('value_date', '<=', $to);
        }
        return ApiResponse::paginated($q->orderByDesc('value_date')->paginate((int) $request->query('per_page', 50)));
    }

    /**
     * POST /v1/bank-reconciliation/import
     * Importe un lot de lignes (JSON array). Dédupe sur value_date + amount + external_reference.
     */
    public function import(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.value_date' => ['required', 'date'],
            'lines.*.label' => ['required', 'string', 'max:500'],
            'lines.*.amount' => ['required', 'numeric'],
            'lines.*.external_reference' => ['nullable', 'string', 'max:255'],
            'lines.*.bank_account_code' => ['nullable', 'string', 'max:40'],
        ]);

        $companyId = optional($request->user())->company_id;
        $created = 0;
        $skipped = 0;

        foreach ($data['lines'] as $row) {
            $exists = BankStatementLine::where('value_date', $row['value_date'])
                ->where('amount', $row['amount'])
                ->when($row['external_reference'] ?? null, fn ($q, $v) => $q->where('external_reference', $v))
                ->exists();
            if ($exists) { $skipped++; continue; }

            BankStatementLine::create([
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'value_date' => $row['value_date'],
                'label' => $row['label'],
                'amount' => $row['amount'],
                'external_reference' => $row['external_reference'] ?? null,
                'bank_account_code' => $row['bank_account_code'] ?? null,
                'status' => 'unmatched',
            ]);
            $created++;
        }

        return ApiResponse::success(['created' => $created, 'skipped_duplicates' => $skipped], null, null, 201);
    }

    /**
     * GET /v1/bank-reconciliation/{line}/suggestions
     * Paiements candidats : date ±3 jours, montant exact, méthode bank/check/transfer.
     */
    public function suggestions(BankStatementLine $line): JsonResponse
    {
        if ($line->status === 'matched') {
            return ApiResponse::success([]);
        }

        $amount = abs((float) $line->amount);
        $from = Carbon::parse($line->value_date)->subDays(3);
        $to = Carbon::parse($line->value_date)->addDays(3);

        $suggestions = Payment::query()
            ->whereNull('deleted_at')
            ->whereIn('payment_method', ['bank_transfer', 'check', 'card'])
            ->whereRaw('ABS(amount - ?) < 0.01', [$amount])
            ->whereBetween('payment_date', [$from->toDateString(), $to->toDateString()])
            ->whereNotIn('id', fn ($q) => $q->select('matched_payment_id')
                ->from('bank_statement_lines')->whereNotNull('matched_payment_id'))
            ->orderBy('payment_date')
            ->limit(10)
            ->get(['id', 'payment_number', 'payment_date', 'payment_method', 'amount', 'customer_id', 'external_reference']);

        return ApiResponse::success($suggestions);
    }

    /**
     * POST /v1/bank-reconciliation/{line}/match/{payment}
     */
    public function match(Request $request, BankStatementLine $line, Payment $payment): JsonResponse
    {
        if ($line->status === 'matched') {
            return ApiResponse::message('Line already matched.', 422);
        }
        if (abs((float) $line->amount) - (float) $payment->amount > 0.01 && abs((float) $line->amount) - (float) $payment->amount < -0.01) {
            return ApiResponse::message('Amounts do not match.', 422);
        }
        $line->status = 'matched';
        $line->matched_payment_id = $payment->id;
        $line->matched_by_user_id = optional($request->user())->id;
        $line->matched_at = now();
        $line->save();

        return ApiResponse::success($line);
    }

    /**
     * POST /v1/bank-reconciliation/{line}/ignore
     */
    public function ignore(Request $request, BankStatementLine $line): JsonResponse
    {
        if ($line->status === 'matched') {
            return ApiResponse::message('Matched line cannot be ignored — unmatch first.', 422);
        }
        $line->status = 'ignored';
        $line->matched_by_user_id = optional($request->user())->id;
        $line->matched_at = now();
        $line->save();

        return ApiResponse::success($line);
    }

    /**
     * POST /v1/bank-reconciliation/{line}/unmatch
     */
    public function unmatch(BankStatementLine $line): JsonResponse
    {
        $line->status = 'unmatched';
        $line->matched_payment_id = null;
        $line->matched_at = null;
        $line->save();

        return ApiResponse::success($line);
    }

    /**
     * POST /v1/bank-reconciliation/auto-match
     * Rapproche en masse les lignes `unmatched` qui ont EXACTEMENT un candidat
     * paiement avec : même montant (±0,01), date ±1 jour, méthode banque/chèque/carte,
     * pas déjà matché par une autre ligne.
     *
     * Body (optionnel) :
     *   - from, to : fenêtre value_date à rapprocher (par défaut toutes les unmatched)
     *   - dry_run  : si true, retourne les scores sans écrire
     */
    public function autoMatch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'dry_run' => ['nullable', 'boolean'],
        ]);
        $dryRun = filter_var($data['dry_run'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $lines = BankStatementLine::query()
            ->where('status', 'unmatched')
            ->when($data['from'] ?? null, fn ($q, $v) => $q->whereDate('value_date', '>=', $v))
            ->when($data['to'] ?? null, fn ($q, $v) => $q->whereDate('value_date', '<=', $v))
            ->orderBy('value_date')
            ->get();

        $usedPaymentIds = BankStatementLine::query()
            ->whereNotNull('matched_payment_id')
            ->pluck('matched_payment_id')
            ->all();

        $matched = 0;
        $ambiguous = 0;
        $none = 0;
        $details = [];

        foreach ($lines as $line) {
            $amount = abs((float) $line->amount);
            $from = Carbon::parse($line->value_date)->subDay();
            $to = Carbon::parse($line->value_date)->addDay();

            $candidates = Payment::query()
                ->whereNull('deleted_at')
                ->whereIn('payment_method', ['bank_transfer', 'check', 'card'])
                ->whereRaw('ABS(amount - ?) < 0.01', [$amount])
                ->whereBetween('payment_date', [$from->toDateString(), $to->toDateString()])
                ->whereNotIn('id', $usedPaymentIds)
                ->limit(2)
                ->get(['id', 'payment_number', 'amount']);

            if ($candidates->count() === 1) {
                $payment = $candidates->first();
                if (! $dryRun) {
                    $line->status = 'matched';
                    $line->matched_payment_id = $payment->id;
                    $line->matched_by_user_id = optional($request->user())->id;
                    $line->matched_at = now();
                    $line->save();
                    $usedPaymentIds[] = $payment->id;
                }
                $matched++;
                $details[] = [
                    'line_id' => $line->id,
                    'value_date' => (string) $line->value_date,
                    'amount' => (float) $line->amount,
                    'payment_id' => $payment->id,
                    'payment_number' => $payment->payment_number,
                    'score' => 100,
                ];
            } elseif ($candidates->count() > 1) {
                $ambiguous++;
            } else {
                $none++;
            }
        }

        return ApiResponse::success([
            'scanned' => $lines->count(),
            'matched' => $matched,
            'ambiguous' => $ambiguous,
            'no_candidate' => $none,
            'dry_run' => $dryRun,
            'details' => $details,
        ], ['message' => $dryRun
            ? "Simulation : {$matched} lignes rapprochables, {$ambiguous} ambiguës, {$none} sans candidat."
            : "{$matched} lignes rapprochées, {$ambiguous} ambiguës ignorées, {$none} sans candidat.",
        ]);
    }
}
