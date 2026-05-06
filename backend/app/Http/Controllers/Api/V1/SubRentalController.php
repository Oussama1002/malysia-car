<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\SubRentalContract;
use App\Models\Vehicle;
use App\Services\AuditLogger;
use App\Services\VehicleOperationalService;
use App\Support\PaymentMethodNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SubRentalController extends Controller
{
    public function __construct(private readonly VehicleOperationalService $ops) {}

    public function index(Request $request): JsonResponse
    {
        $q = SubRentalContract::query()->with(['supplierAgency', 'vehicle'])->orderByDesc('created_at');
        if ($request->query('status')) {
            $q->where('status', $request->query('status'));
        }
        $per = min(100, max(1, (int) $request->query('per_page', 50)));

        return ApiResponse::paginated($q->paginate($per));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_agency_id' => ['required', 'uuid', 'exists:supplier_agencies,id'],
            'vehicle_id' => ['nullable', 'uuid', 'exists:vehicles,id'],
            'external_vehicle_identity' => ['nullable', 'array'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'daily_cost' => ['nullable', 'numeric', 'min:0'],
            'total_cost' => ['nullable', 'numeric', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:40'],
            'supplier_contract_file_id' => ['nullable', 'uuid'],
            'notes' => ['nullable', 'string'],
            'company_id' => ['nullable', 'uuid'],
        ]);

        $row = SubRentalContract::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $data['company_id'] ?? $request->user()?->company_id,
            'supplier_agency_id' => $data['supplier_agency_id'],
            'vehicle_id' => $data['vehicle_id'] ?? null,
            'external_vehicle_identity' => $data['external_vehicle_identity'] ?? null,
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'] ?? null,
            'daily_cost' => $data['daily_cost'] ?? null,
            'total_cost' => $data['total_cost'] ?? null,
            'deposit_amount' => $data['deposit_amount'] ?? null,
            'payment_method' => PaymentMethodNormalizer::normalize($data['payment_method'] ?? null),
            'status' => 'draft',
            'supplier_contract_file_id' => $data['supplier_contract_file_id'] ?? null,
            'notes' => $data['notes'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        AuditLogger::created($row, $request->user(), request: $request);

        return ApiResponse::success($row->load(['supplierAgency', 'vehicle']), null, null, 201);
    }

    public function show(SubRentalContract $subRentalContract): JsonResponse
    {
        return ApiResponse::success($subRentalContract->load(['supplierAgency', 'vehicle']));
    }

    public function activate(Request $request, SubRentalContract $subRentalContract): JsonResponse
    {
        $updated = DB::transaction(function () use ($subRentalContract) {
            $subRentalContract->status = 'active';
            $subRentalContract->save();

            if ($subRentalContract->vehicle_id) {
                $v = Vehicle::query()->find($subRentalContract->vehicle_id);
                if ($v) {
                    $v->ownership_status = 'sub_rented';
                    $v->save();
                }
            }

            return $subRentalContract->fresh(['supplierAgency', 'vehicle']);
        });

        AuditLogger::statusChanged($updated, 'draft', 'active', $request->user(), $request, module: 'fleet');

        return ApiResponse::success($updated);
    }

    public function returnContract(Request $request, SubRentalContract $subRentalContract): JsonResponse
    {
        $updated = DB::transaction(function () use ($subRentalContract) {
            $subRentalContract->status = 'returned';
            $subRentalContract->save();

            if ($subRentalContract->vehicle_id) {
                $v = Vehicle::query()->find($subRentalContract->vehicle_id);
                if ($v) {
                    $v->ownership_status = 'owned';
                    $this->ops->tryReleaseAfterWorkshop($v);
                }
            }

            return $subRentalContract->fresh(['supplierAgency', 'vehicle']);
        });

        AuditLogger::statusChanged($updated, 'active', 'returned', $request->user(), $request, module: 'fleet');

        return ApiResponse::success($updated);
    }

    public function close(Request $request, SubRentalContract $subRentalContract): JsonResponse
    {
        $subRentalContract->status = 'closed';
        $subRentalContract->save();

        AuditLogger::statusChanged($subRentalContract, 'returned', 'closed', $request->user(), $request, module: 'fleet');

        return ApiResponse::success($subRentalContract->fresh());
    }
}
