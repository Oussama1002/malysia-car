<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\LegalCase;
use App\Models\RepossessionOrder;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LegalCaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = LegalCase::query()->with(['customer', 'arrearsCase']);

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($type = $request->query('case_type')) {
            $q->where('case_type', $type);
        }
        if ($customer = $request->query('customer_id')) {
            $q->where('customer_id', $customer);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('case_number', 'like', "%{$search}%")
                    ->orWhere('court_reference', 'like', "%{$search}%");
            });
        }

        $per = min(100, max(1, (int) $request->query('per_page', 25)));

        return ApiResponse::paginated($q->orderByDesc('filing_date')->paginate($per));
    }

    public function show(LegalCase $legalCase): JsonResponse
    {
        $legalCase->load(['customer', 'arrearsCase.actions', 'repossessionOrders']);

        return ApiResponse::success($legalCase);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'arrears_case_id' => ['required', 'uuid', 'exists:arrears_cases,id'],
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'contract_id' => ['nullable', 'uuid'],
            'vehicle_id' => ['nullable', 'uuid'],
            'case_type' => ['required', 'in:recovery,repossession,judgment,settlement'],
            'claimed_amount' => ['required', 'numeric', 'min:0'],
            'lawyer_name' => ['nullable', 'string', 'max:120'],
            'lawyer_contact' => ['nullable', 'string', 'max:120'],
            'court_reference' => ['nullable', 'string', 'max:120'],
            'court_name' => ['nullable', 'string', 'max:120'],
            'filing_date' => ['nullable', 'date'],
            'hearing_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'assigned_to_user_id' => ['nullable', 'uuid'],
        ]);

        $legalCase = LegalCase::create(array_merge($data, [
            'id' => (string) Str::uuid(),
            'case_number' => 'LEG-' . strtoupper(Str::random(8)),
            'status' => 'open',
            'created_by_user_id' => optional($request->user())->id,
        ]));

        AuditLogger::legalAction(
            action: 'case_opened',
            subject: $legalCase,
            user: $request->user(),
            request: $request,
            label: 'Dossier juridique ouvert',
        );

        return ApiResponse::success($legalCase->fresh(['customer', 'arrearsCase']), null, null, 201);
    }

    public function update(Request $request, LegalCase $legalCase): JsonResponse
    {
        $data = $request->validate([
            'status' => ['sometimes', 'in:open,in_progress,judgment_obtained,appeal,settled,closed'],
            'lawyer_name' => ['nullable', 'string', 'max:120'],
            'lawyer_contact' => ['nullable', 'string', 'max:120'],
            'court_reference' => ['nullable', 'string', 'max:120'],
            'court_name' => ['nullable', 'string', 'max:120'],
            'filing_date' => ['nullable', 'date'],
            'hearing_date' => ['nullable', 'date'],
            'judgment_date' => ['nullable', 'date'],
            'awarded_amount' => ['nullable', 'numeric', 'min:0'],
            'judgment_summary' => ['nullable', 'string'],
            'documents' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
            'assigned_to_user_id' => ['nullable', 'uuid'],
        ]);

        if (isset($data['status']) && in_array($data['status'], ['settled', 'closed'], true)) {
            $data['closed_at'] = now();
        }

        $previousStatus = (string) $legalCase->status;
        $before = $legalCase->getOriginal();
        $legalCase->fill($data)->save();

        $newStatus = (string) $legalCase->status;
        if (isset($data['status']) && $previousStatus !== $newStatus) {
            AuditLogger::statusChanged(
                subject: $legalCase,
                fromStatus: $previousStatus,
                toStatus: $newStatus,
                user: $request->user(),
                request: $request,
                legal: true,
            );
        } else {
            AuditLogger::updated($legalCase, $request->user(), before: array_intersect_key($before, $legalCase->getChanges()), after: $legalCase->getChanges(), request: $request, legal: true);
        }

        return ApiResponse::success($legalCase->fresh());
    }

    // ==================================================================
    // Repossession orders
    // ==================================================================

    public function createRepossessionOrder(Request $request, LegalCase $legalCase): JsonResponse
    {
        $data = $request->validate([
            'vehicle_id' => ['required', 'uuid', 'exists:vehicles,id'],
            'ordered_at' => ['required', 'date'],
            'recovery_agent' => ['nullable', 'string', 'max:120'],
            'recovery_location' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ]);

        $order = RepossessionOrder::create(array_merge($data, [
            'id' => (string) Str::uuid(),
            'legal_case_id' => $legalCase->id,
            'customer_id' => $legalCase->customer_id,
            'order_number' => 'REP-' . strtoupper(Str::random(8)),
            'status' => 'ordered',
            'created_by_user_id' => optional($request->user())->id,
        ]));

        AuditLogger::legalAction(
            action: 'repossession_ordered',
            subject: $order,
            user: $request->user(),
            request: $request,
            label: 'Ordre de reprise émis',
        );

        return ApiResponse::success($order, null, null, 201);
    }

    public function updateRepossessionOrder(Request $request, RepossessionOrder $repossessionOrder): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:ordered,in_progress,completed,failed,cancelled'],
            'completed_at' => ['nullable', 'date'],
            'recovery_agent' => ['nullable', 'string', 'max:120'],
            'recovery_location' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'photos' => ['nullable', 'array'],
        ]);

        if ($data['status'] === 'completed' && empty($data['completed_at'])) {
            $data['completed_at'] = now()->toDateString();
        }

        $repossessionOrder->fill($data)->save();

        return ApiResponse::success($repossessionOrder->fresh());
    }
}
