<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AccountingAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AccountingAccountController extends Controller
{
    /**
     * Display a listing of accounts (full chart of accounts — no pagination).
     */
    public function index(Request $request): JsonResponse
    {
        $query = AccountingAccount::query();

        if ($request->filled('account_type')) {
            $query->where('account_type', $request->input('account_type'));
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->filled('parent_code')) {
            $query->where('parent_code', $request->input('parent_code'));
        }

        if ($request->filled('search')) {
            $term = '%' . $request->input('search') . '%';
            $query->where(function ($q) use ($term) {
                $q->where('code', 'LIKE', $term)
                  ->orWhere('name', 'LIKE', $term);
            });
        }

        $accounts = $query->orderBy('code')->get();

        return ApiResponse::success($accounts);
    }

    /**
     * Store a new accounting account.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code'             => ['required', 'string', 'max:30', 'unique:accounting_accounts,code'],
            'name'             => ['required', 'string', 'max:160'],
            'account_type'     => ['required', 'in:asset,liability,equity,income,expense,contra'],
            'normal_balance'   => ['required', 'in:debit,credit'],
            'parent_code'      => ['nullable', 'string', 'max:30'],
            'is_detail'        => ['nullable', 'boolean'],
            'opening_balance'  => ['nullable', 'numeric'],
            'currency_code'    => ['nullable', 'string', 'size:3'],
            'notes'            => ['nullable', 'string'],
        ]);

        $account = AccountingAccount::create([
            'id'              => (string) Str::uuid(),
            'company_id'      => optional($request->user())->company_id,
            'code'            => $validated['code'],
            'name'            => $validated['name'],
            'account_type'    => $validated['account_type'],
            'normal_balance'  => $validated['normal_balance'],
            'parent_code'     => $validated['parent_code'] ?? null,
            'is_detail'       => $validated['is_detail'] ?? true,
            'opening_balance' => $validated['opening_balance'] ?? 0,
            'current_balance' => $validated['opening_balance'] ?? 0,
            'currency_code'   => $validated['currency_code'] ?? null,
            'notes'           => $validated['notes'] ?? null,
        ]);

        return ApiResponse::success($account, null, null, 201);
    }

    /**
     * Display a single account with line count.
     */
    public function show(AccountingAccount $accountingAccount): JsonResponse
    {
        $accountingAccount->loadCount('lines');

        return ApiResponse::success($accountingAccount);
    }

    /**
     * Update an existing accounting account.
     */
    public function update(Request $request, AccountingAccount $accountingAccount): JsonResponse
    {
        $validated = $request->validate([
            'code'            => ['sometimes', 'required', 'string', 'max:30', 'unique:accounting_accounts,code,' . $accountingAccount->id],
            'name'            => ['sometimes', 'required', 'string', 'max:160'],
            'account_type'    => ['sometimes', 'required', 'in:asset,liability,equity,income,expense,contra'],
            'normal_balance'  => ['sometimes', 'required', 'in:debit,credit'],
            'parent_code'     => ['nullable', 'string', 'max:30'],
            'is_detail'       => ['nullable', 'boolean'],
            'opening_balance' => ['nullable', 'numeric'],
            'currency_code'   => ['nullable', 'string', 'size:3'],
            'notes'           => ['nullable', 'string'],
        ]);

        $accountingAccount->fill($validated);
        $accountingAccount->save();

        return ApiResponse::success($accountingAccount);
    }

    /**
     * Soft-delete an accounting account after checking for posted lines.
     */
    public function destroy(AccountingAccount $accountingAccount): JsonResponse
    {
        if ($accountingAccount->lines()->exists()) {
            return ApiResponse::message('Cannot delete an account that has posted journal lines.', 422);
        }

        $accountingAccount->delete();

        return ApiResponse::message('Account deleted successfully.', 200);
    }
}
