<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\SubRentalContract;
use App\Models\Vehicle;
use App\Services\AuditLogger;
use App\Services\SubRentalService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SubRentalController extends Controller
{
    public function __construct(private readonly SubRentalService $service) {}

    public function index(Request $request): JsonResponse
    {
        $q = SubRentalContract::query()
            ->with(['supplierAgency', 'vehicle'])
            ->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($supplierId = $request->query('supplier_agency_id')) {
            $q->where('supplier_agency_id', $supplierId);
        }
        if ($vehicleId = $request->query('vehicle_id')) {
            $q->where('vehicle_id', $vehicleId);
        }
        if ($request->boolean('due_soon')) {
            $q->where('status', 'active')
              ->whereDate('end_date', '<=', Carbon::today()->addDays(3)->toDateString());
        }
        if ($request->boolean('overdue')) {
            $q->where('status', 'active')
              ->whereDate('end_date', '<', Carbon::today()->toDateString());
        }

        $per = min(100, max(1, (int) $request->query('per_page', 50)));
        $page = $q->paginate($per);

        return ApiResponse::paginated($page);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_agency_id'              => ['required', 'uuid', 'exists:supplier_agencies,id'],
            'vehicle_id'                      => ['nullable', 'uuid', 'exists:vehicles,id'],
            'contract_number'                 => ['nullable', 'string', 'max:100'],
            'external_vehicle_identity'       => ['nullable', 'array'],
            'external_vehicle_identity.registration_number' => ['nullable', 'string', 'max:50'],
            'external_vehicle_identity.brand_name'          => ['nullable', 'string', 'max:100'],
            'external_vehicle_identity.model_name'          => ['nullable', 'string', 'max:100'],
            'external_vehicle_identity.year'                => ['nullable', 'integer', 'min:1990', 'max:2100'],
            'external_vehicle_identity.color'               => ['nullable', 'string', 'max:50'],
            'external_vehicle_identity.mileage'             => ['nullable', 'numeric', 'min:0'],
            'start_date'                      => ['required', 'date'],
            'end_date'                        => ['required', 'date', 'after:start_date'],
            'daily_cost'                      => ['required', 'numeric', 'min:0'],
            'total_cost'                      => ['nullable', 'numeric', 'min:0'],
            'deposit_amount'                  => ['nullable', 'numeric', 'min:0'],
            'payment_method'                  => ['nullable', 'in:cash,bank_transfer,cheque,card,other'],
            'notes'                           => ['nullable', 'string'],
        ]);

        $user = $request->user();

        if (!isset($data['vehicle_id']) && empty($data['external_vehicle_identity'])) {
            return ApiResponse::error('Un véhicule existant ou une identité de véhicule externe est requise.', 422);
        }

        $contract = $this->service->createContract(array_merge($data, [
            'company_id' => $user->company_id,
            'branch_id'  => $user->branch_id ?? null,
        ]), $user->id);

        AuditLogger::created($contract);

        return ApiResponse::success($contract->load(['supplierAgency', 'vehicle']), null, null, 201);
    }

    public function show(string $id): JsonResponse
    {
        $contract = SubRentalContract::with([
            'supplierAgency',
            'vehicle.brand',
            'vehicle.model',
            'payments',
            'returnReport',
        ])->findOrFail($id);

        return ApiResponse::success($contract);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $contract = SubRentalContract::findOrFail($id);

        if (!in_array($contract->status, ['draft'], true)) {
            return ApiResponse::error('Seul un contrat en brouillon peut être modifié.', 422);
        }

        $data = $request->validate([
            'supplier_agency_id'              => ['sometimes', 'uuid', 'exists:supplier_agencies,id'],
            'vehicle_id'                      => ['nullable', 'uuid', 'exists:vehicles,id'],
            'contract_number'                 => ['nullable', 'string', 'max:100'],
            'external_vehicle_identity'       => ['nullable', 'array'],
            'start_date'                      => ['sometimes', 'date'],
            'end_date'                        => ['sometimes', 'date', 'after:start_date'],
            'daily_cost'                      => ['sometimes', 'numeric', 'min:0'],
            'total_cost'                      => ['nullable', 'numeric', 'min:0'],
            'deposit_amount'                  => ['nullable', 'numeric', 'min:0'],
            'payment_method'                  => ['nullable', 'in:cash,bank_transfer,cheque,card,other'],
            'notes'                           => ['nullable', 'string'],
        ]);

        // Recalculate total_cost if dates or daily_cost changed
        if (isset($data['daily_cost']) || isset($data['start_date']) || isset($data['end_date'])) {
            $start = Carbon::parse($data['start_date'] ?? $contract->start_date);
            $end   = Carbon::parse($data['end_date'] ?? $contract->end_date);
            $days  = max(1, $start->diffInDays($end));
            $daily = (float) ($data['daily_cost'] ?? $contract->daily_cost);

            if (!isset($data['total_cost'])) {
                $data['total_cost'] = $days * $daily;
            }
        }

        $contract->update($data);
        AuditLogger::updated($contract);

        return ApiResponse::success($contract->fresh(['supplierAgency', 'vehicle']));
    }

    public function activate(Request $request, string $id): JsonResponse
    {
        $contract = SubRentalContract::with('supplierAgency')->findOrFail($id);
        $updated = $this->service->activateContract($contract, $request->user()->id);
        AuditLogger::statusChanged($updated, 'draft', 'active');

        return ApiResponse::success($updated->load(['supplierAgency', 'vehicle']));
    }

    public function returnToSupplier(Request $request, string $id): JsonResponse
    {
        $contract = SubRentalContract::with(['supplierAgency', 'vehicle'])->findOrFail($id);

        $data = $request->validate([
            'returned_at'        => ['nullable', 'date'],
            'odometer_km'        => ['nullable', 'numeric', 'min:0'],
            'fuel_level'         => ['nullable', 'in:empty,quarter,half,three_quarters,full'],
            'condition_notes'    => ['nullable', 'string'],
            'damage_notes'       => ['nullable', 'string'],
            'extra_charges'      => ['nullable', 'numeric', 'min:0'],
            'signed_by_supplier' => ['nullable', 'string', 'max:191'],
            'file_id'            => ['nullable', 'uuid'],
        ]);

        $updated = $this->service->returnToSupplier($contract, $data, $request->user()->id);
        AuditLogger::statusChanged($updated, 'active', 'returned');

        return ApiResponse::success($updated);
    }

    public function close(Request $request, string $id): JsonResponse
    {
        $contract = SubRentalContract::findOrFail($id);

        $forceClose = $request->boolean('force_close');
        $user = $request->user();
        $role = strtoupper((string) ($user->primaryRoleCode() ?? ''));

        if ($forceClose && !in_array($role, ['ADMIN', 'DIRECTEUR'], true)) {
            return ApiResponse::error('Seul un ADMIN ou DIRECTEUR peut forcer la clôture.', 403);
        }

        $updated = $this->service->closeContract($contract, $user->id, $forceClose);
        AuditLogger::statusChanged($updated, $contract->status, 'closed');

        return ApiResponse::success($updated);
    }

    public function profitability(string $id): JsonResponse
    {
        $contract = SubRentalContract::findOrFail($id);
        $data = $this->service->computeProfitability($contract);

        return ApiResponse::success($data);
    }

    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();

        $base = SubRentalContract::query()->where('company_id', $user->company_id);

        $activeCount   = (clone $base)->where('status', 'active')->count();
        $dueSoonCount  = (clone $base)->where('status', 'active')
            ->whereDate('end_date', '<=', Carbon::today()->addDays(3)->toDateString())
            ->count();
        $overdueCount  = (clone $base)->where('status', 'active')
            ->whereDate('end_date', '<', Carbon::today()->toDateString())
            ->count();

        // Monthly supplier cost (current month)
        $monthStart = Carbon::now()->startOfMonth();
        $monthEnd   = Carbon::now()->endOfMonth();
        $monthlyCost = (clone $base)
            ->whereIn('status', ['active', 'returned', 'closed'])
            ->whereDate('start_date', '<=', $monthEnd->toDateString())
            ->whereDate('end_date', '>=', $monthStart->toDateString())
            ->sum('total_cost');

        // Total margin from all contracts with vehicles
        $contracts = (clone $base)->where('status', 'active')->get();
        $totalMargin = $contracts->sum(fn ($c) => $c->margin());

        return ApiResponse::success([
            'active_sub_rentals'  => $activeCount,
            'due_soon'            => $dueSoonCount,
            'overdue'             => $overdueCount,
            'monthly_supplier_cost' => (float) $monthlyCost,
            'total_margin'        => $totalMargin,
        ]);
    }

    public function uploadDocument(Request $request, string $id): JsonResponse
    {
        $contract = SubRentalContract::findOrFail($id);

        $request->validate([
            'file'     => ['required', 'file', 'max:20480'],
            'doc_type' => ['nullable', 'string', 'in:supplier_contract,return_report,other'],
        ]);

        $file = $request->file('file');
        $path = $file->store("sub-rentals/{$id}", 'local');

        $docType = $request->input('doc_type', 'other');

        // Store file reference
        $fileRecord = \App\Models\File::create([
            'company_id'   => $contract->company_id,
            'original_name'=> $file->getClientOriginalName(),
            'stored_name'  => basename($path),
            'storage_disk' => 'local',
            'storage_path' => $path,
            'mime_type'    => $file->getMimeType(),
            'extension'    => $file->getClientOriginalExtension(),
            'file_size'    => $file->getSize(),
            'uploaded_by'  => $request->user()->id,
        ]);

        if ($docType === 'supplier_contract') {
            $contract->update(['supplier_contract_file_id' => $fileRecord->id]);
        } elseif ($docType === 'return_report') {
            $contract->update(['return_report_file_id' => $fileRecord->id]);
        }

        AuditLogger::record('document_uploaded', $request->user(), 'sub_rental_contract', $contract->id, null, ['file_id' => $fileRecord->id, 'doc_type' => $docType], 'fleet');

        return ApiResponse::success($fileRecord, null, null, 201);
    }
}
