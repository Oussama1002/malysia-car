<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AccountingJournal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AccountingJournalController extends Controller
{
    /**
     * Display a listing of journals (full list — no pagination).
     */
    public function index(Request $request): JsonResponse
    {
        $query = AccountingJournal::query();

        if ($request->filled('journal_type')) {
            $query->where('journal_type', $request->input('journal_type'));
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        $journals = $query->orderBy('code')->get();

        return ApiResponse::success($journals);
    }

    /**
     * Store a new accounting journal.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code'                 => ['required', 'string', 'max:20', 'unique:accounting_journals,code'],
            'name'                 => ['required', 'string', 'max:120'],
            'journal_type'         => ['required', 'in:sales,purchases,cash,bank,general,payroll,stock'],
            'default_account_code' => ['nullable', 'string', 'max:30'],
            'is_default'           => ['nullable', 'boolean'],
            'sequence_prefix'      => ['nullable', 'string', 'max:10'],
        ]);

        $journal = AccountingJournal::create([
            'id'                   => (string) Str::uuid(),
            'code'                 => $validated['code'],
            'name'                 => $validated['name'],
            'journal_type'         => $validated['journal_type'],
            'default_account_code' => $validated['default_account_code'] ?? null,
            'is_default'           => $validated['is_default'] ?? false,
            'sequence_prefix'      => $validated['sequence_prefix'] ?? null,
        ]);

        return ApiResponse::success($journal, null, null, 201);
    }

    /**
     * Update an existing accounting journal.
     */
    public function update(Request $request, AccountingJournal $accountingJournal): JsonResponse
    {
        $validated = $request->validate([
            'code'                 => ['sometimes', 'required', 'string', 'max:20', 'unique:accounting_journals,code,' . $accountingJournal->id],
            'name'                 => ['sometimes', 'required', 'string', 'max:120'],
            'journal_type'         => ['sometimes', 'required', 'in:sales,purchases,cash,bank,general,payroll,stock'],
            'default_account_code' => ['nullable', 'string', 'max:30'],
            'is_default'           => ['nullable', 'boolean'],
            'sequence_prefix'      => ['nullable', 'string', 'max:10'],
        ]);

        // If this journal is being set as the default, unset all other defaults first.
        if (!empty($validated['is_default']) && $validated['is_default']) {
            AccountingJournal::where('id', '!=', $accountingJournal->id)
                ->where('is_default', true)
                ->update(['is_default' => false]);
        }

        $accountingJournal->fill($validated);
        $accountingJournal->save();

        return ApiResponse::success($accountingJournal);
    }

    /**
     * Delete a journal after checking for existing entries.
     */
    public function destroy(AccountingJournal $accountingJournal): JsonResponse
    {
        if ($accountingJournal->entries()->exists()) {
            return ApiResponse::message('Cannot delete a journal that has existing entries.', 422);
        }

        $accountingJournal->delete();

        return ApiResponse::message('Journal deleted successfully.', 200);
    }
}
