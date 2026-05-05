<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AccountingAccount;
use App\Models\AccountingEntry;
use App\Models\AccountingEntryLine;
use App\Models\AccountingJournal;
use App\Models\FiscalPeriod;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AccountingEntryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = AccountingEntry::query()->with(['journal']);

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($journal = $request->query('journal_id')) {
            $q->where('journal_id', $journal);
        }
        if ($period = $request->query('fiscal_period_id')) {
            $q->where('fiscal_period_id', $period);
        }
        if ($source = $request->query('source_type')) {
            $q->where('source_type', $source);
        }
        if ($ref = $request->query('reference')) {
            $q->where('reference', 'like', "%{$ref}%");
        }
        if ($from = $request->query('from')) {
            $q->whereDate('entry_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->whereDate('entry_date', '<=', $to);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('entry_number', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $per = min(200, max(1, (int) $request->query('per_page', 50)));

        return ApiResponse::paginated($q->orderByDesc('entry_date')->orderByDesc('created_at')->paginate($per));
    }

    public function show(AccountingEntry $accountingEntry): JsonResponse
    {
        $accountingEntry->load(['lines', 'journal', 'fiscalPeriod.fiscalYear']);

        return ApiResponse::success($accountingEntry);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'journal_id' => ['required', 'uuid', 'exists:accounting_journals,id'],
            'fiscal_period_id' => ['nullable', 'uuid', 'exists:fiscal_periods,id'],
            'entry_date' => ['required', 'date'],
            'description' => ['required', 'string', 'max:500'],
            'reference' => ['nullable', 'string', 'max:120'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'lines' => ['required', 'array', 'min:2'],
            'lines.*.account_code' => ['required', 'string', 'max:30'],
            'lines.*.label' => ['required', 'string', 'max:500'],
            'lines.*.debit' => ['required', 'numeric', 'min:0'],
            'lines.*.credit' => ['required', 'numeric', 'min:0'],
            'lines.*.tax_id' => ['nullable', 'uuid'],
            'lines.*.tax_amount' => ['nullable', 'numeric'],
            'lines.*.third_party_type' => ['nullable', 'string', 'max:30'],
            'lines.*.third_party_id' => ['nullable', 'uuid'],
            'lines.*.branch_id' => ['nullable', 'uuid'],
            'lines.*.cost_center' => ['nullable', 'string', 'max:60'],
        ]);

        $entry = null;
        DB::transaction(function () use (&$entry, $data, $request) {
            // Resolve fiscal period if not provided
            $fiscalPeriodId = $data['fiscal_period_id'] ?? null;
            if (! $fiscalPeriodId) {
                $period = FiscalPeriod::where('status', 'open')
                    ->whereDate('start_date', '<=', $data['entry_date'])
                    ->whereDate('end_date', '>=', $data['entry_date'])
                    ->first();
                $fiscalPeriodId = $period?->id;
            }

            $journal = AccountingJournal::find($data['journal_id']);
            $entryNumber = $this->generateEntryNumber($journal);

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => optional($request->user())->company_id,
                'journal_id' => $data['journal_id'],
                'fiscal_period_id' => $fiscalPeriodId,
                'entry_number' => $entryNumber,
                'entry_date' => $data['entry_date'],
                'description' => $data['description'],
                'reference' => $data['reference'] ?? null,
                'status' => 'draft',
                'source_type' => 'manual',
                'currency_code' => $data['currency_code'] ?? 'MAD',
                'created_by_user_id' => optional($request->user())->id,
            ]);

            foreach ($data['lines'] as $idx => $line) {
                // Resolve account_id from code
                $account = AccountingAccount::where('code', $line['account_code'])->first();
                AccountingEntryLine::create([
                    'id' => (string) Str::uuid(),
                    'entry_id' => $entry->id,
                    'account_code' => $line['account_code'],
                    'account_id' => $account?->id,
                    'line_order' => $idx + 1,
                    'label' => $line['label'],
                    'debit' => (float) $line['debit'],
                    'credit' => (float) $line['credit'],
                    'currency_code' => $data['currency_code'] ?? 'MAD',
                    'tax_id' => $line['tax_id'] ?? null,
                    'tax_amount' => $line['tax_amount'] ?? null,
                    'third_party_type' => $line['third_party_type'] ?? null,
                    'third_party_id' => $line['third_party_id'] ?? null,
                    'branch_id' => $line['branch_id'] ?? null,
                    'cost_center' => $line['cost_center'] ?? null,
                ]);
            }

            $entry->recalculateTotals();
            $entry->save();
        });

        AuditLogger::financialAction(
            action: 'accounting_created',
            subject: $entry,
            user: $request->user(),
            request: $request,
            label: 'Écriture comptable créée',
        );

        return ApiResponse::success($entry->fresh('lines'), null, null, 201);
    }

    public function update(Request $request, AccountingEntry $accountingEntry): JsonResponse
    {
        if ($accountingEntry->status === 'posted') {
            return ApiResponse::message('Posted entries cannot be edited.', 422);
        }

        $data = $request->validate([
            'entry_date' => ['sometimes', 'date'],
            'description' => ['sometimes', 'string', 'max:500'],
            'reference' => ['nullable', 'string', 'max:120'],
        ]);

        $accountingEntry->fill($data)->save();

        return ApiResponse::success($accountingEntry->fresh('lines'));
    }

    public function destroy(AccountingEntry $accountingEntry): JsonResponse
    {
        if ($accountingEntry->status === 'posted') {
            return ApiResponse::message('Posted entries cannot be deleted.', 422);
        }
        $accountingEntry->lines()->delete();
        $accountingEntry->delete();

        return ApiResponse::message('Entry deleted');
    }

    // ==================================================================
    // Posting workflow
    // ==================================================================

    public function post(Request $request, AccountingEntry $accountingEntry): JsonResponse
    {
        if ($accountingEntry->status === 'posted') {
            return ApiResponse::message('Entry already posted.', 422);
        }

        $missingAccounts = [];
        foreach ($accountingEntry->lines as $line) {
            $ok = AccountingAccount::query()
                ->where('code', $line->account_code)
                ->where('is_active', true)
                ->exists();
            if (!$ok) {
                $missingAccounts[] = $line->account_code;
            }
        }
        if (!empty($missingAccounts)) {
            return ApiResponse::message(
                'Impossible de comptabiliser: comptes requis absents/inactifs ('.implode(', ', array_unique($missingAccounts)).').',
                422
            );
        }

        $accountingEntry->recalculateTotals();
        if (! $accountingEntry->isBalanced()) {
            return ApiResponse::message(
                sprintf(
                    'Entry is not balanced. Debit: %s — Credit: %s.',
                    $accountingEntry->total_debit,
                    $accountingEntry->total_credit,
                ),
                422,
            );
        }

        DB::transaction(function () use ($accountingEntry, $request) {
            $accountingEntry->status = 'posted';
            $accountingEntry->posted_at = now();
            $accountingEntry->posted_by_user_id = optional($request->user())->id;
            $accountingEntry->save();

            // Update account running balances
            foreach ($accountingEntry->lines as $line) {
                $account = AccountingAccount::where('code', $line->account_code)->first();
                if ($account) {
                    if ($account->normal_balance === 'debit') {
                        $account->current_balance = (float) $account->current_balance
                            + (float) $line->debit
                            - (float) $line->credit;
                    } else {
                        $account->current_balance = (float) $account->current_balance
                            + (float) $line->credit
                            - (float) $line->debit;
                    }
                    $account->save();
                }
            }
        });

        AuditLogger::financialAction(
            action: 'accounting_posted',
            subject: $accountingEntry,
            user: $request->user(),
            request: $request,
            label: 'Écriture comptabilisée',
        );

        return ApiResponse::success($accountingEntry->fresh(['lines', 'journal']));
    }

    public function cancel(Request $request, AccountingEntry $accountingEntry): JsonResponse
    {
        if ($accountingEntry->status !== 'posted') {
            return ApiResponse::message('Only posted entries can be cancelled (by reversal).', 422);
        }

        // Create a reversal entry
        $reversal = null;
        DB::transaction(function () use (&$reversal, $accountingEntry, $request) {
            $journal = AccountingJournal::find($accountingEntry->journal_id);
            $reversal = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $accountingEntry->company_id,
                'journal_id' => $accountingEntry->journal_id,
                'fiscal_period_id' => $accountingEntry->fiscal_period_id,
                'entry_number' => $this->generateEntryNumber($journal) . '-REV',
                'entry_date' => now()->toDateString(),
                'description' => 'EXTOURNE: ' . $accountingEntry->description,
                'reference' => $accountingEntry->entry_number,
                'status' => 'draft',
                'source_type' => 'reversal',
                'source_id' => $accountingEntry->id,
                'currency_code' => $accountingEntry->currency_code,
                'created_by_user_id' => optional($request->user())->id,
            ]);

            foreach ($accountingEntry->lines as $idx => $line) {
                AccountingEntryLine::create([
                    'id' => (string) Str::uuid(),
                    'entry_id' => $reversal->id,
                    'account_code' => $line->account_code,
                    'account_id' => $line->account_id,
                    'line_order' => $idx + 1,
                    'label' => 'EXTOURNE: ' . $line->label,
                    'debit' => $line->credit,   // swap
                    'credit' => $line->debit,   // swap
                    'currency_code' => $line->currency_code,
                    'third_party_type' => $line->third_party_type,
                    'third_party_id' => $line->third_party_id,
                    'branch_id' => $line->branch_id,
                ]);
            }

            $reversal->recalculateTotals();
            $reversal->save();

            $accountingEntry->status = 'cancelled';
            $accountingEntry->save();
        });

        AuditLogger::financialAction(
            action: 'accounting_cancelled',
            subject: $accountingEntry,
            user: $request->user(),
            request: $request,
            label: 'Écriture extournée',
            after: ['reversal_id' => $reversal->id],
        );

        return ApiResponse::success($reversal->fresh('lines'), null, null, 201);
    }

    // ==================================================================
    // Helpers
    // ==================================================================

    private function generateEntryNumber(?AccountingJournal $journal): string
    {
        $prefix = $journal?->sequence_prefix ?? 'JNL';
        $year = now()->format('Y');
        $seq = $journal ? $journal->sequence_next : 1;
        $number = $prefix . $year . '-' . str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
        if ($journal) {
            $journal->increment('sequence_next');
        }

        return $number;
    }
}
