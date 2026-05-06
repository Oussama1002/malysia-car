<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Contracts\StoreContractRequest;
use App\Http\Requests\Api\V1\Contracts\UpdateContractRequest;
use App\Http\Resources\ContractResource;
use App\Http\Responses\ApiResponse;
use App\Models\Contract;
use App\Models\CreditApplication;
use App\Models\CreditScore;
use App\Models\ContractHistory;
use App\Models\ContractInstallment;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\RentalAvailabilityService;
use App\Support\PaymentMethodNormalizer;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;

class ContractController extends Controller
{
    public function __construct(
        private readonly NotificationService $notifications,
        private readonly RentalAvailabilityService $rentalAvailability,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $q = Contract::query();

        if ($type = $request->query('type')) {
            $q->where('contract_type', $type);
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($customerId = $request->query('customer_id')) {
            $q->where('customer_id', $customerId);
        }
        if ($vehicleId = $request->query('vehicle_id')) {
            $q->where('vehicle_id', $vehicleId);
        }

        $per = min(100, max(1, (int) $request->query('per_page', 50)));
        $page = $q->orderByDesc('updated_at')->paginate($per);

        return ApiResponse::success(
            ContractResource::collection($page->items())->resolve($request),
            [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ]
        );
    }

    public function show(Request $request, Contract $contract): JsonResponse
    {
        $contract->load(['history']);

        return ApiResponse::success([
            'contract' => (new ContractResource($contract))->resolve($request),
            'history' => $contract->history,
        ]);
    }

    public function store(StoreContractRequest $request): JsonResponse
    {
        $data = $request->validated();
        $actorRole = method_exists($request->user(), 'primaryRoleCode') ? $request->user()->primaryRoleCode() : '';
        $isDirectorLevel = in_array($actorRole, ['ADMIN', 'DIRECTEUR'], true);

        if (!empty($data['credit_application_id'])) {
            $credit = CreditApplication::query()->find($data['credit_application_id']);
            if ($credit) {
                $latestScore = CreditScore::query()
                    ->where('credit_application_id', $credit->id)
                    ->orderByDesc('scored_at')
                    ->first();
                if (($latestScore?->risk_band ?? null) === 'D' && !$isDirectorLevel) {
                    return ApiResponse::error('Score D: creation de contrat interdite sans override directeur.', 422);
                }
            }
        }

        /** @var Contract $c */
        $c = DB::transaction(function () use ($data, $request) {
            $c = new Contract;
            $c->id = (string) Str::uuid();
            $c->company_id = $data['company_id'] ?? $request->user()?->company_id;
            $c->branch_id = $data['branch_id'] ?? null;
            $c->contract_number = $data['contract_number'] ?? ('CTR-'.now()->format('Ymd').'-'.strtoupper(Str::random(6)));
            $c->contract_type = $data['contract_type'];
            $c->customer_id = $data['customer_id'];
            $c->vehicle_id = $data['vehicle_id'] ?? null;
            $c->template_id = $data['template_id'] ?? null;
            $c->credit_application_id = $data['credit_application_id'] ?? null;
            $c->status = $data['status'] ?? 'draft';
            $c->legal_status = $data['legal_status'] ?? 'pending';
            $c->signature_status = $data['signature_status'] ?? 'pending';
            $c->start_date = $data['start_date'] ?? null;
            $c->end_date = $data['end_date'] ?? null;
            $c->duration_months = $data['duration_months'] ?? null;
            $c->currency_code = $data['currency_code'] ?? 'MAD';
            foreach ([
                'base_amount',
                'monthly_payment',
                'down_payment_amount',
                'buyout_option_amount',
                'allowed_km',
                'excess_km_rate',
                'deposit_amount',
                'insurance_included',
                'maintenance_included',
                'notes',
                'payment_method',
                'payment_terms',
                'bank_reference',
                'cheque_number',
                'expected_payment_day',
            ] as $k) {
                if (array_key_exists($k, $data)) {
                    $c->{$k} = $data[$k];
                }
            }
            $c->created_by = auth()->id();
            $c->save();

            ContractHistory::query()->create([
                'id' => (string) Str::uuid(),
                'contract_id' => $c->id,
                'action' => 'created',
                'to_status' => $c->status,
                'actor_id' => auth()->id(),
                'at' => now(),
            ]);

            return $c->fresh();
        });

        AuditLogger::created($c, $request->user(), request: $request);
        if ((string) $c->status === 'pending_approval') {
            $this->notifications->notifyRoles(
                roleCodes: ['ADMIN', 'DIRECTEUR'],
                category: 'contract.pending_approval',
                title: 'Contrat en attente d\'approbation',
                body: 'Le contrat '.$c->contract_number.' attend une validation.',
                module: 'contracts',
                priority: 'high',
                entity: $c,
                customerId: $c->customer_id,
                linkUrl: '/contracts/'.$c->id,
            );
        }

        return ApiResponse::success((new ContractResource($c))->resolve($request), null, null, 201);
    }

    public function update(UpdateContractRequest $request, Contract $contract): JsonResponse
    {
        $data = $request->validated();
        $before = $contract->getOriginal();

        $updated = DB::transaction(function () use ($contract, $data) {
            $locked = Contract::withoutGlobalScopes()
                ->whereKey((string) $contract->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $from = (string) $locked->status;

            foreach ([
                'company_id',
                'branch_id',
                'contract_number',
                'contract_type',
                'customer_id',
                'vehicle_id',
                'template_id',
                'credit_application_id',
                'legal_status',
                'signature_status',
                'start_date',
                'end_date',
                'duration_months',
                'currency_code',
                'base_amount',
                'monthly_payment',
                'down_payment_amount',
                'buyout_option_amount',
                'allowed_km',
                'excess_km_rate',
                'deposit_amount',
                'insurance_included',
                'maintenance_included',
                'activation_date',
                'closure_date',
                'signed_at',
                'terminated_reason',
                'notes',
                'payment_method',
                'payment_terms',
                'bank_reference',
                'cheque_number',
                'expected_payment_day',
            ] as $k) {
                if (array_key_exists($k, $data)) {
                    $locked->{$k} = $data[$k];
                }
            }
            if (array_key_exists('status', $data)) {
                $locked->status = $data['status'];
            }
            if ((string) $locked->status === 'active') {
                $this->assertContractPaymentReadyForActivation($locked);
            }
            if ((string) $locked->status === 'active' && $locked->vehicle_id) {
                [$windowStart, $windowEnd] = $this->rentalAvailability->contractActiveWindow($locked);
                $this->rentalAvailability->assertVehicleAvailableWithLock(
                    (string) $locked->vehicle_id,
                    $windowStart,
                    $windowEnd,
                    null,
                    (string) $locked->id,
                );
            }
            $locked->save();

            $to = (string) $locked->status;
            if ($from !== $to) {
                ContractHistory::query()->create([
                    'id' => (string) Str::uuid(),
                    'contract_id' => $locked->id,
                    'action' => 'status_changed',
                    'from_status' => $from,
                    'to_status' => $to,
                    'actor_id' => auth()->id(),
                    'at' => now(),
                ]);
            } else {
                ContractHistory::query()->create([
                    'id' => (string) Str::uuid(),
                    'contract_id' => $locked->id,
                    'action' => 'updated',
                    'actor_id' => auth()->id(),
                    'at' => now(),
                ]);
            }

            return $locked->fresh();
        });

        $oldStatus = (string) ($before['status'] ?? '');
        $newStatus = (string) $updated->status;
        if ($oldStatus !== '' && $oldStatus !== $newStatus) {
            AuditLogger::statusChanged(
                subject: $updated,
                fromStatus: $oldStatus,
                toStatus: $newStatus,
                user: $request->user(),
                request: $request,
                legal: true,
            );
            if ($newStatus === 'pending_approval') {
                $this->notifications->notifyRoles(
                    roleCodes: ['ADMIN', 'DIRECTEUR'],
                    category: 'contract.pending_approval',
                    title: 'Contrat en attente d\'approbation',
                    body: 'Le contrat '.$updated->contract_number.' attend une validation.',
                    module: 'contracts',
                    priority: 'high',
                    entity: $updated,
                    customerId: $updated->customer_id,
                    linkUrl: '/contracts/'.$updated->id,
                );
            }
        }
        AuditLogger::updated($updated, $request->user(), before: $before, after: $updated->getAttributes(), request: $request);

        return ApiResponse::success((new ContractResource($updated))->resolve($request));
    }

    public function approve(Request $request, Contract $contract): JsonResponse
    {
        $note = $request->validate(['note' => ['sometimes', 'nullable', 'string', 'max:255']])['note'] ?? null;
        $previousStatus = (string) $contract->status;

        $updated = DB::transaction(function () use ($contract, $note) {
            $from = (string) $contract->status;
            $contract->status = 'approved';
            $contract->approved_by = auth()->id();
            $contract->save();

            ContractHistory::query()->create([
                'id' => (string) Str::uuid(),
                'contract_id' => $contract->id,
                'action' => 'approved',
                'from_status' => $from,
                'to_status' => 'approved',
                'note' => $note,
                'actor_id' => auth()->id(),
                'at' => now(),
            ]);

            return $contract->fresh();
        });

        AuditLogger::statusChanged(
            subject: $updated,
            fromStatus: $previousStatus,
            toStatus: 'approved',
            user: $request->user(),
            request: $request,
            legal: true,
            label: 'Contrat approuvé',
        );
        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'CONTENTIEUX', 'COMPTABLE', 'DIRECTEUR', 'ADMIN'],
            category: 'contract.approved',
            title: 'Contrat approuve',
            body: 'Le contrat '.$updated->contract_number.' est approuve.',
            module: 'contracts',
            priority: 'normal',
            entity: $updated,
            customerId: $updated->customer_id,
            linkUrl: '/contracts/'.$updated->id,
        );

        return ApiResponse::success((new ContractResource($updated))->resolve($request));
    }

    public function activate(Request $request, Contract $contract): JsonResponse
    {
        $note = $request->validate(['note' => ['sometimes', 'nullable', 'string', 'max:255']])['note'] ?? null;
        $previousStatus = (string) $contract->status;

        $updated = DB::transaction(function () use ($contract, $note) {
            $locked = Contract::withoutGlobalScopes()
                ->whereKey((string) $contract->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            $this->assertContractPaymentReadyForActivation($locked);

            if ($locked->vehicle_id) {
                [$windowStart, $windowEnd] = $this->rentalAvailability->contractActiveWindow($locked);
                $this->rentalAvailability->assertVehicleAvailableWithLock(
                    (string) $locked->vehicle_id,
                    $windowStart,
                    $windowEnd,
                    null,
                    (string) $locked->id,
                );
            }
            $from = (string) $locked->status;
            $locked->status = 'active';
            $locked->activation_date = now();
            $locked->save();

            ContractHistory::query()->create([
                'id' => (string) Str::uuid(),
                'contract_id' => $locked->id,
                'action' => 'activated',
                'from_status' => $from,
                'to_status' => 'active',
                'note' => $note,
                'actor_id' => auth()->id(),
                'at' => now(),
            ]);

            return $locked->fresh();
        });

        AuditLogger::statusChanged(
            subject: $updated,
            fromStatus: $previousStatus,
            toStatus: 'active',
            user: $request->user(),
            request: $request,
            legal: true,
            label: 'Contrat activé',
        );
        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'COMPTABLE', 'DIRECTEUR', 'ADMIN'],
            category: 'contract.activated',
            title: 'Contrat active',
            body: 'Le contrat '.$updated->contract_number.' est actif.',
            module: 'contracts',
            priority: 'high',
            entity: $updated,
            customerId: $updated->customer_id,
            linkUrl: '/contracts/'.$updated->id,
        );

        return ApiResponse::success((new ContractResource($updated))->resolve($request));
    }

    public function terminate(Request $request, Contract $contract): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        $previousStatus = (string) $contract->status;

        $updated = DB::transaction(function () use ($contract, $data) {
            $from = (string) $contract->status;
            $contract->status = 'terminated';
            $contract->terminated_reason = $data['reason'];
            $contract->closure_date = now();
            $contract->save();

            ContractHistory::query()->create([
                'id' => (string) Str::uuid(),
                'contract_id' => $contract->id,
                'action' => 'terminated',
                'from_status' => $from,
                'to_status' => 'terminated',
                'note' => $data['note'] ?? null,
                'actor_id' => auth()->id(),
                'at' => now(),
            ]);

            return $contract->fresh();
        });

        AuditLogger::statusChanged(
            subject: $updated,
            fromStatus: $previousStatus,
            toStatus: 'terminated',
            user: $request->user(),
            request: $request,
            legal: true,
            label: 'Contrat résilié',
            extra: ['reason' => $data['reason'] ?? null],
        );
        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'CONTENTIEUX', 'COMPTABLE', 'DIRECTEUR', 'ADMIN'],
            category: 'contract.terminated',
            title: 'Contrat resilie',
            body: 'Le contrat '.$updated->contract_number.' a ete resilie.',
            module: 'contracts',
            priority: 'high',
            entity: $updated,
            customerId: $updated->customer_id,
            linkUrl: '/contracts/'.$updated->id,
        );

        return ApiResponse::success((new ContractResource($updated))->resolve($request));
    }

    public function installments(Request $request, Contract $contract): JsonResponse
    {
        $rows = $contract->installments()->get();
        return ApiResponse::success($rows);
    }

    public function generateSchedule(Request $request, Contract $contract): JsonResponse
    {
        $data = $request->validate([
            'start_date' => ['nullable', 'date'],
            'months' => ['nullable', 'integer', 'min:1', 'max:120'],
            'monthly_amount' => ['nullable', 'numeric', 'min:0'],
            'tax_rate' => ['nullable', 'numeric', 'min:0', 'max:1'],
        ]);

        $start = isset($data['start_date']) ? Carbon::parse($data['start_date']) : ($contract->start_date ? Carbon::parse($contract->start_date) : now());
        $months = (int) ($data['months'] ?? $contract->duration_months ?? 12);
        $monthly = (float) ($data['monthly_amount'] ?? $contract->monthly_payment ?? 0);
        $taxRate = (float) ($data['tax_rate'] ?? 0.2);

        $rows = DB::transaction(function () use ($contract, $start, $months, $monthly, $taxRate) {
            ContractInstallment::query()->where('contract_id', $contract->id)->delete();

            $out = [];
            for ($i = 1; $i <= $months; $i++) {
                $due = $start->copy()->addMonthsNoOverflow($i)->startOfDay();
                $tax = round($monthly * $taxRate, 2);
                $total = round($monthly + $tax, 2);

                $out[] = ContractInstallment::query()->create([
                    'id' => (string) Str::uuid(),
                    'contract_id' => $contract->id,
                    'installment_number' => $i,
                    'due_date' => $due->toDateString(),
                    'principal_amount' => $monthly,
                    'interest_amount' => 0,
                    'tax_amount' => $tax,
                    'penalty_amount' => 0,
                    'total_due_amount' => $total,
                    'total_paid_amount' => 0,
                    'balance_amount' => $total,
                    'installment_status' => 'DUE',
                ]);
            }

            ContractHistory::query()->create([
                'id' => (string) Str::uuid(),
                'contract_id' => $contract->id,
                'action' => 'schedule_generated',
                'actor_id' => auth()->id(),
                'at' => now(),
                'note' => "{$months} installments",
            ]);

            return $out;
        });

        return ApiResponse::success(['installments' => $rows]);
    }

    private function assertContractPaymentReadyForActivation(Contract $locked): void
    {
        $pm = PaymentMethodNormalizer::normalize($locked->payment_method ?? null);
        if ($pm === null || $pm === '') {
            throw ValidationException::withMessages([
                'payment_method' => [__('Méthode de paiement obligatoire pour activer le contrat.')],
            ]);
        }
        if ($pm === 'check' && empty($locked->cheque_number)) {
            throw ValidationException::withMessages([
                'cheque_number' => [__('Numéro de chèque obligatoire pour ce mode de paiement.')],
            ]);
        }
    }
}

