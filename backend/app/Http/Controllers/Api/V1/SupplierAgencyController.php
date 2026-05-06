<?php

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

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($query) use ($search) {
                $query->where('name', 'like', "%{$search}%")
                    ->orWhere('city', 'like', "%{$search}%")
                    ->orWhere('contact_person', 'like', "%{$search}%");
            });
        }
        if ($request->boolean('with_contracts_count')) {
            $q->withCount('subRentalContracts')
              ->withCount(['subRentalContracts as active_contracts_count' => fn ($q) => $q->where('status', 'active')]);
        }

        $per = min(100, max(1, (int) $request->query('per_page', 50)));
        $page = $q->paginate($per);

        return ApiResponse::paginated($page);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'           => ['required', 'string', 'max:191'],
            'contact_person' => ['nullable', 'string', 'max:191'],
            'phone'          => ['nullable', 'string', 'max:30'],
            'email'          => ['nullable', 'email', 'max:191'],
            'address'        => ['nullable', 'string'],
            'city'           => ['nullable', 'string', 'max:100'],
            'ice'            => ['nullable', 'string', 'max:50'],
            'rc'             => ['nullable', 'string', 'max:50'],
            'status'         => ['nullable', 'in:active,inactive,blacklisted'],
            'notes'          => ['nullable', 'string'],
        ]);

        $user = $request->user();

        $agency = SupplierAgency::create(array_merge($data, [
            'id'         => (string) Str::uuid(),
            'company_id' => $user->company_id,
            'branch_id'  => $user->branch_id ?? null,
            'status'     => $data['status'] ?? 'active',
            'created_by' => $user->id,
        ]));

        AuditLogger::created($agency);

        return ApiResponse::success($agency, null, null, 201);
    }

    public function show(string $id): JsonResponse
    {
        $agency = SupplierAgency::withCount([
            'subRentalContracts',
            'subRentalContracts as active_contracts_count' => fn ($q) => $q->where('status', 'active'),
        ])
        ->with(['subRentalContracts' => fn ($q) => $q->latest()->limit(5)])
        ->findOrFail($id);

        return ApiResponse::success($agency);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $agency = SupplierAgency::findOrFail($id);

        $data = $request->validate([
            'name'           => ['sometimes', 'string', 'max:191'],
            'contact_person' => ['nullable', 'string', 'max:191'],
            'phone'          => ['nullable', 'string', 'max:30'],
            'email'          => ['nullable', 'email', 'max:191'],
            'address'        => ['nullable', 'string'],
            'city'           => ['nullable', 'string', 'max:100'],
            'ice'            => ['nullable', 'string', 'max:50'],
            'rc'             => ['nullable', 'string', 'max:50'],
            'status'         => ['nullable', 'in:active,inactive,blacklisted'],
            'notes'          => ['nullable', 'string'],
        ]);

        $agency->update($data);
        AuditLogger::updated($agency);

        return ApiResponse::success($agency);
    }

    public function destroy(string $id): JsonResponse
    {
        $agency = SupplierAgency::findOrFail($id);

        if ($agency->activeSubRentalContracts()->exists()) {
            return ApiResponse::error('Impossible de supprimer une agence avec des contrats actifs.', 422);
        }

        AuditLogger::deleted($agency);
        $agency->delete();

        return ApiResponse::message('Agence fournisseur supprimée.');
    }
}
