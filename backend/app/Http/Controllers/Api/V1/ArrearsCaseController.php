<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ArrearsAction;
use App\Models\ArrearsCase;
use App\Models\ContractInstallment;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ArrearsCaseController extends Controller
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function index(Request $request): JsonResponse
    {
        $q = ArrearsCase::query()->with(['customer', 'contract']);

        if ($stage = $request->query('stage')) {
            $q->where('stage', $stage);
        }
        if ($customer = $request->query('customer_id')) {
            $q->where('customer_id', $customer);
        }
        if ($branch = $request->query('branch_id')) {
            $q->where('branch_id', $branch);
        }
        if ($assigned = $request->query('assigned_to_user_id')) {
            $q->where('assigned_to_user_id', $assigned);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('case_number', 'like', "%{$search}%")
                    ->orWhereHas('customer', fn ($cw) => $cw->where('full_name', 'like', "%{$search}%"));
            });
        }

        $per = min(100, max(1, (int) $request->query('per_page', 25)));

        return ApiResponse::paginated($q->orderByDesc('days_overdue')->paginate($per));
    }

    public function show(ArrearsCase $arrearsCase): JsonResponse
    {
        $arrearsCase->load(['customer', 'contract', 'actions', 'legalCase.repossessionOrders']);

        return ApiResponse::success($arrearsCase);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'contract_id' => ['nullable', 'uuid', 'exists:contracts,id'],
            'branch_id' => ['nullable', 'uuid'],
            'total_overdue' => ['nullable', 'numeric', 'min:0'],
            'overdue_installments_count' => ['nullable', 'integer', 'min:0'],
            'days_overdue' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string'],
            'next_action_date' => ['nullable', 'date'],
            'assigned_to_user_id' => ['nullable', 'uuid'],
        ]);

        // Prevent duplicate open case per contract
        if (! empty($data['contract_id'])) {
            $existing = ArrearsCase::where('contract_id', $data['contract_id'])
                ->whereNotIn('stage', ['closed'])
                ->first();
            if ($existing) {
                return ApiResponse::message('An open arrears case already exists for this contract.', 422);
            }
        }

        // Auto-compute overdue if contract_id given and values not supplied
        if (! empty($data['contract_id']) && empty($data['total_overdue'])) {
            $overdue = ContractInstallment::where('contract_id', $data['contract_id'])
                ->where('installment_status', 'overdue')
                ->get();
            $data['total_overdue'] = $overdue->sum(fn ($i) => max(0, (float) $i->total_due_amount - (float) $i->total_paid_amount));
            $data['overdue_installments_count'] = $overdue->count();
            $data['days_overdue'] = $overdue->max(fn ($i) => max(0, now()->diffInDays($i->due_date))) ?? 0;
        }

        $case = ArrearsCase::create(array_merge($data, [
            'id' => (string) Str::uuid(),
            'company_id' => optional($request->user())->company_id,
            'case_number' => 'ARR-' . strtoupper(Str::random(8)),
            'stage' => 'new',
            'resolution' => 'pending',
            'total_recovered' => 0,
            'created_by_user_id' => optional($request->user())->id,
        ]));

        AuditLogger::legalAction(
            action: 'case_opened',
            subject: $case,
            user: $request->user(),
            request: $request,
            label: 'Dossier impayés ouvert',
        );
        $this->notifications->notifyRoles(
            roleCodes: ['CONTENTIEUX', 'DIRECTEUR', 'ADMIN', 'COMPTABLE'],
            category: 'arrears.detected',
            title: 'Impaye detecte',
            body: 'Nouveau dossier impayes '.$case->case_number.' cree.',
            module: 'arrears',
            priority: 'high',
            customerId: $case->customer_id,
            entity: $case,
            linkUrl: '/arrears/'.$case->id,
        );

        return ApiResponse::success($case->fresh(['customer', 'contract']), null, null, 201);
    }

    public function update(Request $request, ArrearsCase $arrearsCase): JsonResponse
    {
        $data = $request->validate([
            'total_overdue' => ['nullable', 'numeric', 'min:0'],
            'total_recovered' => ['nullable', 'numeric', 'min:0'],
            'overdue_installments_count' => ['nullable', 'integer'],
            'days_overdue' => ['nullable', 'integer'],
            'notes' => ['nullable', 'string'],
            'next_action_date' => ['nullable', 'date'],
            'assigned_to_user_id' => ['nullable', 'uuid'],
            'resolution' => ['nullable', 'in:paid,written_off,settlement,legal_judgment,repossessed,pending'],
        ]);
        $before = $arrearsCase->getOriginal();
        $arrearsCase->fill($data)->save();

        AuditLogger::updated($arrearsCase, $request->user(), before: array_intersect_key($before, $arrearsCase->getChanges()), after: $arrearsCase->getChanges(), request: $request, legal: true);

        return ApiResponse::success($arrearsCase->fresh());
    }

    // ==================================================================
    // Action / stage-machine endpoint
    // ==================================================================

    public function action(Request $request, ArrearsCase $arrearsCase): JsonResponse
    {
        $data = $request->validate([
            'action_type' => ['required', 'in:note,reminder_call,reminder_sms,reminder_email,formal_notice,payment_promise,partial_payment,legal_transfer,repossession_order,repossession_done,settlement,write_off,stage_change,close'],
            'description' => ['required', 'string'],
            'action_date' => ['required', 'date'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'promise_date' => ['nullable', 'date'],
            'attachments' => ['nullable', 'array'],
        ]);

        // Determine new stage from action type
        $stageMap = [
            'reminder_call' => 'reminder_1',
            'reminder_sms' => 'reminder_1',
            'reminder_email' => 'reminder_1',
            'formal_notice' => 'formal_notice',
            'payment_promise' => 'promise',
            'legal_transfer' => 'legal',
            'repossession_order' => 'repossession',
            'settlement' => 'closed',
            'write_off' => 'closed',
            'close' => 'closed',
        ];
        $resolutionMap = [
            'settlement' => 'settlement',
            'write_off' => 'written_off',
        ];

        $newStage = $stageMap[$data['action_type']] ?? null;
        // Only advance stage; never go back
        $stageOrder = ['new', 'reminder_1', 'reminder_2', 'formal_notice', 'promise', 'legal', 'repossession', 'closed'];
        if ($newStage && array_search($newStage, $stageOrder) < array_search($arrearsCase->stage, $stageOrder)) {
            $newStage = null;
        }
        // reminder_1 → reminder_2 on second reminder
        if ($newStage === 'reminder_1' && $arrearsCase->stage === 'reminder_1') {
            $newStage = 'reminder_2';
        }

        DB::transaction(function () use ($arrearsCase, $data, $newStage, $resolutionMap, $request) {
            $arrearsCase->actions()->create([
                'id' => (string) Str::uuid(),
                'action_type' => $data['action_type'],
                'description' => $data['description'],
                'action_date' => $data['action_date'],
                'amount' => $data['amount'] ?? null,
                'promise_date' => $data['promise_date'] ?? null,
                'new_stage' => $newStage,
                'attachments' => $data['attachments'] ?? null,
                'performed_by_user_id' => optional($request->user())->id,
            ]);

            if ($newStage) {
                $arrearsCase->stage = $newStage;
            }
            if (isset($resolutionMap[$data['action_type']])) {
                $arrearsCase->resolution = $resolutionMap[$data['action_type']];
            }
            if ($data['action_type'] === 'partial_payment' && ! empty($data['amount'])) {
                $arrearsCase->total_recovered = (float) $arrearsCase->total_recovered + (float) $data['amount'];
            }
            if ($newStage === 'closed') {
                $arrearsCase->closed_at = now();
            }
            $arrearsCase->save();
        });

        return ApiResponse::success($arrearsCase->fresh(['actions', 'legalCase']));
    }

    public function escalate(Request $request, ArrearsCase $arrearsCase): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string'],
        ]);

        $stageOrder = ['new', 'reminder_1', 'reminder_2', 'formal_notice', 'promise', 'legal', 'repossession', 'closed'];
        $currentIdx = array_search($arrearsCase->stage, $stageOrder);
        $nextStage = $stageOrder[min($currentIdx + 1, count($stageOrder) - 1)] ?? $arrearsCase->stage;

        $arrearsCase->actions()->create([
            'id' => (string) Str::uuid(),
            'action_type' => 'stage_change',
            'description' => 'Escalade: ' . $data['reason'],
            'action_date' => now()->toDateString(),
            'new_stage' => $nextStage,
            'performed_by_user_id' => optional($request->user())->id,
        ]);
        $previousStage = (string) $arrearsCase->getOriginal('stage');
        $arrearsCase->stage = $nextStage;
        $arrearsCase->save();

        AuditLogger::legalAction(
            action: 'case_escalated',
            subject: $arrearsCase,
            user: $request->user(),
            request: $request,
            label: 'Escalade contentieux',
            before: ['stage' => $previousStage],
            after: ['stage' => $nextStage, 'reason' => $data['reason']],
        );
        $this->notifications->notifyRoles(
            roleCodes: ['CONTENTIEUX', 'DIRECTEUR', 'ADMIN'],
            category: 'arrears.escalated',
            title: 'Contentieux escalade',
            body: 'Le dossier '.$arrearsCase->case_number.' est escalade vers '.$nextStage.'.',
            module: 'arrears',
            priority: 'critical',
            customerId: $arrearsCase->customer_id,
            entity: $arrearsCase,
            linkUrl: '/arrears/'.$arrearsCase->id,
        );

        return ApiResponse::success($arrearsCase->fresh('actions'));
    }
}
