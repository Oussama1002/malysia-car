<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Tax;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TaxController extends Controller
{
    /**
     * Display a listing of taxes.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Tax::query();

        if ($request->filled('tax_type')) {
            $query->where('tax_type', $request->input('tax_type'));
        }

        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->input('is_active'), FILTER_VALIDATE_BOOLEAN));
        }

        $taxes = $query->orderBy('code')->get();

        return ApiResponse::success($taxes);
    }

    /**
     * Store a new tax.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code'         => ['required', 'string', 'max:30', 'unique:taxes,code'],
            'name'         => ['required', 'string', 'max:160'],
            'rate'         => ['required', 'numeric', 'min:0', 'max:100'],
            'tax_type'     => ['required', 'in:vat,withholding,stamp,other'],
            'applies_to'   => ['nullable', 'string'],
            'is_active'    => ['nullable', 'boolean'],
            'account_code' => ['nullable', 'string', 'max:30'],
        ]);

        $tax = Tax::create([
            'id'           => (string) Str::uuid(),
            'code'         => $validated['code'],
            'name'         => $validated['name'],
            'rate'         => $validated['rate'],
            'tax_type'     => $validated['tax_type'],
            'applies_to'   => $validated['applies_to'] ?? null,
            'is_active'    => $validated['is_active'] ?? true,
            'account_code' => $validated['account_code'] ?? null,
        ]);

        return ApiResponse::success($tax, null, null, 201);
    }

    /**
     * Update an existing tax.
     */
    public function update(Request $request, Tax $tax): JsonResponse
    {
        $validated = $request->validate([
            'code'         => ['sometimes', 'required', 'string', 'max:30', 'unique:taxes,code,' . $tax->id],
            'name'         => ['sometimes', 'required', 'string', 'max:160'],
            'rate'         => ['sometimes', 'required', 'numeric', 'min:0', 'max:100'],
            'tax_type'     => ['sometimes', 'required', 'in:vat,withholding,stamp,other'],
            'applies_to'   => ['nullable', 'string'],
            'is_active'    => ['nullable', 'boolean'],
            'account_code' => ['nullable', 'string', 'max:30'],
        ]);

        $tax->fill($validated);
        $tax->save();

        return ApiResponse::success($tax);
    }

    /**
     * Delete a tax.
     */
    public function destroy(Tax $tax): JsonResponse
    {
        $tax->delete();

        return ApiResponse::message('Tax deleted successfully.', 200);
    }
}
