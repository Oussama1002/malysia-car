<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\SupplierAgency;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SupplierAgencyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = SupplierAgency::query()->orderBy('name');
        if ($request->query('status')) {
            $q->where('status', $request->query('status'));
        }
        $per = min(100, max(1, (int) $request->query('per_page', 50)));

        return ApiResponse::paginated($q->paginate($per));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email'],
            'address' => ['nullable', 'string', 'max:500'],
            'contact_person' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', 'in:active,inactive'],
            'notes' => ['nullable', 'string'],
            'company_id' => ['nullable', 'uuid'],
        ]);

        $row = SupplierAgency::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $data['company_id'] ?? $request->user()?->company_id,
            'name' => $data['name'],
            'phone' => $data['phone'] ?? null,
            'email' => $data['email'] ?? null,
            'address' => $data['address'] ?? null,
            'contact_person' => $data['contact_person'] ?? null,
            'status' => $data['status'] ?? 'active',
            'notes' => $data['notes'] ?? null,
        ]);

        AuditLogger::created($row, $request->user(), request: $request);

        return ApiResponse::success($row, null, null, 201);
    }

    public function show(SupplierAgency $supplierAgency): JsonResponse
    {
        return ApiResponse::success($supplierAgency->load('subRentals'));
    }

    public function update(Request $request, SupplierAgency $supplierAgency): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email'],
            'address' => ['nullable', 'string', 'max:500'],
            'contact_person' => ['nullable', 'string', 'max:120'],
            'status' => ['sometimes', 'in:active,inactive'],
            'notes' => ['nullable', 'string'],
        ]);

        $before = $supplierAgency->getOriginal();
        $supplierAgency->update($data);
        AuditLogger::updated($supplierAgency, $request->user(), before: array_intersect_key($before, $supplierAgency->getChanges()), after: $supplierAgency->getChanges(), request: $request);

        return ApiResponse::success($supplierAgency->fresh());
    }
}
