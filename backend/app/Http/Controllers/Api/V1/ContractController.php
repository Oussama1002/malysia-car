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
use App\Models\Payment;
use App\Models\Reservation;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\RentalAvailabilityService;
use App\Services\WalletService;
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
        private readonly WalletService $walletService,
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

        $q->with(['customer', 'vehicle']);
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

        $linkedReservation = Reservation::query()
            ->where('customer_id', $contract->customer_id)
            ->where('vehicle_id', $contract->vehicle_id)
            ->whereNotIn('status', ['cancelled', 'closed'])
            ->orderByDesc('created_at')
            ->first();

        return ApiResponse::success([
            'contract' => (new ContractResource($contract))->resolve($request),
            'history' => $contract->history,
            'linked_reservation_id' => $linkedReservation?->id,
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
            $c->contract_number = $data['contract_number'] ?? $this->generateContractNumber();
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

        // Create Payment records from wizard payment entries
        $paymentEntries = $request->input('payment_entries', []);
        if (is_array($paymentEntries)) {
            $reservation = Reservation::query()
                ->where('customer_id', $c->customer_id)
                ->where('vehicle_id', $c->vehicle_id)
                ->whereNotIn('status', ['cancelled', 'closed'])
                ->first();

            foreach ($paymentEntries as $entry) {
                $amount = (float) ($entry['amount'] ?? 0);
                if ($amount <= 0) {
                    continue;
                }
                $paymentNumber = 'PAY-' . strtoupper(substr((string) \Illuminate\Support\Str::uuid(), 0, 8));
                Payment::query()->create([
                    'id' => (string) \Illuminate\Support\Str::uuid(),
                    'company_id' => $c->company_id,
                    'customer_id' => $c->customer_id,
                    'contract_id' => $c->id,
                    'reservation_id' => $reservation?->id,
                    'payment_number' => $paymentNumber,
                    'payment_method' => PaymentMethodNormalizer::normalize($entry['method'] ?? 'cash'),
                    'payment_type' => 'down_payment',
                    'amount' => $amount,
                    'amount_unallocated' => $amount,
                    'currency_code' => 'MAD',
                    'payment_date' => now(),
                    'status' => 'completed',
                    'payment_direction' => 'incoming',
                    'external_reference' => $entry['reference'] ?? null,
                    'check_number' => $entry['cheque_number'] ?? null,
                ]);
            }
        }

        // Auto-create a reservation if none exists for this contract's customer+vehicle+period.
        // Business rule: every contract must have a matching reservation.
        $this->ensureReservationForContract($c, $request);

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
            'reason'      => ['required', 'string', 'max:255'],
            'note'        => ['sometimes', 'nullable', 'string', 'max:255'],
            // early_return: if true, calculate unused days and credit wallet as avoir
            'early_return' => ['sometimes', 'boolean'],
        ]);

        $isEarlyReturn = ! empty($data['early_return'])
            && $contract->end_date
            && now()->lt(\Carbon\Carbon::parse($contract->end_date));

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

        // Auto-credit wallet for early return (outside the contract transaction so
        // a wallet failure does NOT roll back the termination).
        $walletTx = null;
        if ($isEarlyReturn) {
            try {
                $walletTx = $this->walletService->applyEarlyReturnCredit(
                    contract: $updated,
                    performedBy: (string) auth()->id(),
                );
            } catch (\Throwable $e) {
                // Non-blocking: log but do not fail the terminate response
                \Illuminate\Support\Facades\Log::warning('wallet.early_return_credit_failed', [
                    'contract_id' => $updated->id,
                    'error'       => $e->getMessage(),
                ]);
            }
        }

        AuditLogger::statusChanged(
            subject: $updated,
            fromStatus: $previousStatus,
            toStatus: 'terminated',
            user: $request->user(),
            request: $request,
            legal: true,
            label: $isEarlyReturn ? 'Contrat résilié — retour anticipé' : 'Contrat résilié',
            extra: [
                'reason'          => $data['reason'] ?? null,
                'early_return'    => $isEarlyReturn,
                'wallet_credited' => $walletTx ? (float) $walletTx->amount : null,
            ],
        );
        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'CONTENTIEUX', 'COMPTABLE', 'DIRECTEUR', 'ADMIN'],
            category: 'contract.terminated',
            title: 'Contrat resilie',
            body: 'Le contrat '.$updated->contract_number.' a ete resilie.'.
                ($walletTx ? ' Avoir '.number_format((float) $walletTx->amount, 2).' MAD credite.' : ''),
            module: 'contracts',
            priority: 'high',
            entity: $updated,
            customerId: $updated->customer_id,
            linkUrl: '/contracts/'.$updated->id,
        );

        return ApiResponse::success(array_merge(
            (new ContractResource($updated))->resolve($request),
            [
                'early_return_credit' => $walletTx ? [
                    'amount'        => (float) $walletTx->amount,
                    'balance_after' => (float) $walletTx->balance_after,
                    'tx_id'         => $walletTx->id,
                ] : null,
            ]
        ));
    }

    public function destroy(Request $request, Contract $contract): JsonResponse
    {
        if (in_array($contract->status, ['active', 'signed'], true)) {
            return ApiResponse::error('Impossible de supprimer un contrat actif ou signé. Résiliez-le d\'abord.', 422);
        }

        AuditLogger::deleted($contract, $request->user(), request: $request, label: 'Contrat supprimé');

        DB::transaction(function () use ($contract) {
            ContractInstallment::query()->where('contract_id', $contract->id)->delete();
            ContractHistory::query()->where('contract_id', $contract->id)->delete();
            $contract->delete();
        });

        return ApiResponse::message('Contrat supprimé.');
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

    /**
     * Ensure a reservation exists for this contract.
     * Business rule: every valid contract must have an associated reservation.
     * If no reservation exists for the same customer+vehicle+period, auto-create one.
     */
    private function ensureReservationForContract(Contract $contract, Request $request): void
    {
        // Skip if no vehicle or dates — contract not yet fully formed
        if (! $contract->vehicle_id || ! $contract->start_date) {
            return;
        }

        try {
            $endDate = $contract->end_date
                ?? ($contract->start_date && $contract->duration_months
                    ? Carbon::parse($contract->start_date)->addMonths($contract->duration_months)->toDateTimeString()
                    : Carbon::parse($contract->start_date)->addMonths(12)->toDateTimeString());

            // Check if a reservation already exists for this customer+vehicle in the same period
            $existing = Reservation::query()
                ->where('customer_id', $contract->customer_id)
                ->where('vehicle_id', $contract->vehicle_id)
                ->whereNotIn('status', ['cancelled'])
                ->where(function ($q) use ($contract, $endDate) {
                    $q->where('desired_start_at', '<=', $endDate)
                      ->where('desired_end_at', '>=', $contract->start_date);
                })
                ->first();

            if ($existing) {
                // Reservation already exists — ensure it's at least 'reserved' status
                if ($existing->status === 'draft') {
                    $existing->update(['status' => 'reserved']);
                    AuditLogger::statusChanged($existing, 'draft', 'reserved', $request->user(), $request, module: 'rentals');
                }
                return;
            }

            // Auto-create reservation
            $reservation = Reservation::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $contract->company_id,
                'branch_id' => $contract->branch_id,
                'reservation_number' => $this->generateReservationNumber(),
                'customer_id' => $contract->customer_id,
                'vehicle_id' => $contract->vehicle_id,
                'reservation_type' => $this->mapContractTypeToReservationType($contract->contract_type),
                'status' => 'reserved',
                'desired_start_at' => $contract->start_date,
                'desired_end_at' => $endDate,
                'estimated_price' => $contract->base_amount,
                'payment_method' => $contract->payment_method,
                'notes' => "Auto-créée depuis le contrat {$contract->contract_number}",
                'created_by' => auth()->id(),
            ]);

            AuditLogger::statusChanged($reservation, 'new', 'reserved', $request->user(), $request, module: 'rentals');
        } catch (\Throwable $e) {
            // Non-blocking — contract creation should never fail because of reservation auto-creation
            \Illuminate\Support\Facades\Log::warning('contract.auto_reservation_failed', [
                'contract_id' => $contract->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function mapContractTypeToReservationType(string $contractType): string
    {
        return match (strtoupper($contractType)) {
            'LLD', 'LOA' => 'LONG_RENTAL',
            'LOCATION_COURTE' => 'SHORT_RENTAL',
            'CREDIT_AUTO' => 'CREDIT_AUTO',
            'VENTE_VO' => 'VENTE_VO',
            default => 'SHORT_RENTAL',
        };
    }

    private function generateReservationNumber(): string
    {
        $latest = Reservation::query()
            ->where('reservation_number', 'like', 'RSV-%')
            ->orderByRaw("CAST(SUBSTRING(reservation_number, 5) AS UNSIGNED) DESC")
            ->value('reservation_number');

        $seq = 1;
        if ($latest && preg_match('/^RSV-(\d+)$/', $latest, $m)) {
            $seq = (int) $m[1] + 1;
        }

        return 'RSV-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }

    private function generateContractNumber(): string
    {
        $latest = Contract::query()
            ->where('contract_number', 'like', 'CTR-%')
            ->orderByRaw("CAST(SUBSTRING(contract_number, 5) AS UNSIGNED) DESC")
            ->value('contract_number');

        $seq = 1;
        if ($latest && preg_match('/^CTR-(\d+)$/', $latest, $m)) {
            $seq = (int) $m[1] + 1;
        }

        return 'CTR-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }
}

