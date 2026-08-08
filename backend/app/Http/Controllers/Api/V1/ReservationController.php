<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Mission;
use App\Models\Payment;
use App\Models\RentalDamageReport;
use App\Models\RentalExtension;
use App\Models\RentalHandoverReport;
use App\Models\Reservation;
use App\Models\ReservationDriver;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\RentalAvailabilityService;
use App\Support\PaymentMethodNormalizer;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReservationController extends Controller
{
    public function __construct(
        private readonly RentalAvailabilityService $availability,
        private readonly NotificationService $notifications,
    ) {}

    private const FLOW = [
        'draft',
        'reserved',
        'confirmed',
        'pickup_scheduled',
        'handed_over',
        'active',
        'extension_requested',
        'return_scheduled',
        'returned',
        'inspection_pending',
        'damage_pending',
        'billing_pending',
        'closed',
        'cancelled',
    ];

    public function index(Request $request): JsonResponse
    {
        $q = Reservation::query()->with('missions:id,reservation_id,mission_type,status,assigned_user_id,scheduled_start_at')->orderByDesc('created_at');
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($vehicleId = $request->query('vehicle_id')) {
            $q->where('vehicle_id', $vehicleId);
        }
        if ($customerId = $request->query('customer_id')) {
            $q->where('customer_id', $customerId);
        }
        $per = min(100, max(1, (int) $request->query('per_page', 50)));
        $page = $q->paginate($per);

        return ApiResponse::success($page->items(), [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'total' => $page->total(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid'],
            'vehicle_id' => ['required', 'uuid'],
            'reservation_type' => ['required', 'string', 'max:50'],
            'desired_start_at' => ['required', 'date'],
            'desired_end_at' => ['required', 'date'],
            'pickup_address' => ['nullable', 'string', 'max:255'],
            'delivery_address' => ['nullable', 'string', 'max:255'],
            'delivery_latitude' => ['nullable', 'numeric'],
            'delivery_longitude' => ['nullable', 'numeric'],
            'estimated_price' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:40'],
            'pickup_location' => ['nullable', 'string', 'max:500'],
            'return_location' => ['nullable', 'string', 'max:500'],
            'notes' => ['nullable', 'string'],
            'company_id' => ['nullable', 'uuid'],
            'branch_id' => ['nullable', 'uuid'],
            // 'draft' = non-valid intent (non-blocking), 'reserved' = confirmed booking (blocking)
            'is_draft' => ['nullable', 'boolean'],
        ]);

        $isDraft = (bool) ($data['is_draft'] ?? false);

        $r = DB::transaction(function () use ($data, $request, $isDraft) {
            $startAt = Carbon::parse($data['desired_start_at']);
            $endAt = Carbon::parse($data['desired_end_at']);

            // Only block availability for confirmed (non-draft) reservations
            if (! $isDraft) {
                $this->availability->assertVehicleAvailableWithLock($data['vehicle_id'], $startAt, $endAt);
            }

            return Reservation::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $data['company_id'] ?? $request->user()?->company_id,
                'branch_id' => $data['branch_id'] ?? null,
                'reservation_number' => $this->generateReservationNumber(),
                'customer_id' => $data['customer_id'],
                'vehicle_id' => $data['vehicle_id'],
                'reservation_type' => $data['reservation_type'],
                'status' => $isDraft ? 'draft' : 'reserved',
                'desired_start_at' => $data['desired_start_at'],
                'desired_end_at' => $data['desired_end_at'],
                'pickup_address' => $data['pickup_address'] ?? null,
                'delivery_address' => $data['delivery_address'] ?? null,
                'delivery_latitude' => $data['delivery_latitude'] ?? null,
                'delivery_longitude' => $data['delivery_longitude'] ?? null,
                'estimated_price' => $data['estimated_price'] ?? null,
                'payment_method' => PaymentMethodNormalizer::normalize($data['payment_method'] ?? null),
                'pickup_location' => $data['pickup_location'] ?? null,
                'return_location' => $data['return_location'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => auth()->id(),
            ]);
        });

        $initialStatus = $isDraft ? 'draft' : 'reserved';
        AuditLogger::statusChanged($r, 'new', $initialStatus, $request->user(), $request, module: 'rentals');

        // Send notification
        try {
            $ns = app(\App\Services\NotificationService::class);
            if ($isDraft) {
                $ns->notifyRoles(
                    ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
                    'reservation_intent',
                    "Intention de réservation {$r->reservation_number}",
                    "Réservation en attente de confirmation. Véhicule non bloqué — reste disponible.",
                    'rentals',
                    'normal',
                    entity: $r,
                    linkUrl: "/reservations/{$r->id}",
                );
            } else {
                $ns->notifyRoles(
                    ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
                    'reservation_confirmed',
                    "Réservation confirmée {$r->reservation_number}",
                    "Véhicule bloqué pour la période demandée.",
                    'rentals',
                    'normal',
                    entity: $r,
                    linkUrl: "/reservations/{$r->id}",
                );
            }
        } catch (\Throwable) {
            // Non-blocking — notification failure shouldn't abort reservation
        }

        return ApiResponse::success($r, null, null, 201);
    }

    /**
     * Convert a draft (non-valid) reservation into a confirmed (valid) one.
     * This locks the vehicle for the period and checks availability.
     */
    public function validateReservation(Request $request, Reservation $reservation): JsonResponse
    {
        if ($reservation->status !== 'draft') {
            return ApiResponse::error('Seules les réservations en brouillon peuvent être validées.', 422);
        }

        DB::transaction(function () use ($reservation, $request): void {
            $locked = Reservation::withoutGlobalScopes()
                ->whereKey((string) $reservation->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            // Now check availability — draft didn't block, so we must verify the slot is free
            $this->availability->assertVehicleAvailableWithLock(
                (string) $locked->vehicle_id,
                Carbon::parse($locked->desired_start_at),
                Carbon::parse($locked->desired_end_at),
                (string) $locked->id
            );

            $this->transitionReservation($locked, 'reserved', $request);
        });

        // Notify that reservation is now confirmed
        try {
            $ns = app(\App\Services\NotificationService::class);
            $ns->notifyRoles(
                ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
                'reservation_validated',
                "Réservation validée {$reservation->reservation_number}",
                "L'intention de réservation a été confirmée. Véhicule désormais bloqué.",
                'rentals',
                'normal',
                entity: $reservation->fresh(),
                linkUrl: "/reservations/{$reservation->id}",
            );
        } catch (\Throwable) {
            // Non-blocking
        }

        return ApiResponse::success($reservation->fresh());
    }

    public function show(Reservation $reservation): JsonResponse
    {
        $reservation->load(['vehicle.brand', 'vehicle.model']);

        // Load customer separately to avoid crash if relationship is broken
        try {
            $reservation->load(['customer']);
        } catch (\Throwable) {
            // customer_id may reference a deleted customer
        }

        $handoverReports = RentalHandoverReport::query()
            ->where('reservation_id', $reservation->id)
            ->orderBy('performed_at')
            ->get();
        $extensions = RentalExtension::query()
            ->where('reservation_id', $reservation->id)
            ->orderByDesc('requested_at')
            ->get();
        $damages = RentalDamageReport::query()
            ->where('reservation_id', $reservation->id)
            ->orderByDesc('created_at')
            ->get();

        // Drivers — table may not exist yet if migration hasn't run
        $drivers = collect();
        try {
            if (\Schema::hasTable('reservation_drivers')) {
                $drivers = ReservationDriver::query()
                    ->where('reservation_id', $reservation->id)
                    ->orderBy('driver_type')
                    ->get();
            }
        } catch (\Throwable) {
            // graceful fallback
        }

        // Payments linked to this reservation
        $payments = Payment::query()
            ->where('reservation_id', $reservation->id)
            ->orderByDesc('payment_date')
            ->get();

        // Invoices linked via invoice_line metadata
        $invoices = collect();
        try {
            $invoices = Invoice::query()
                ->where('customer_id', $reservation->customer_id)
                ->whereHas('lines', function ($lq) use ($reservation) {
                    $lq->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.reservation_id')) = ?", [$reservation->id]);
                })
                ->with('lines')
                ->orderByDesc('issue_date')
                ->get();
        } catch (\Throwable) {
            // JSON query might fail on some DB configs
        }

        // Audit trail
        $history = collect();
        try {
            $history = DB::table('audit_logs')
                ->where('entity_type', (new Reservation)->getMorphClass())
                ->where('entity_id', $reservation->id)
                ->orderByDesc('created_at')
                ->limit(100)
                ->get();
        } catch (\Throwable) {
            // table might not exist or have different columns
        }

        // Customer/vehicle summary for header
        $customer = $reservation->customer;
        $vehicle = $reservation->vehicle;
        $vehicleName = $vehicle
            ? trim(($vehicle->brand?->name ?? $vehicle->brand_name ?? '') . ' ' . ($vehicle->model?->model_name ?? $vehicle->model?->name ?? $vehicle->model_name ?? ''))
            : null;

        $customerName = null;
        try {
            $customerName = $customer ? $customer->displayName() : null;
        } catch (\Throwable) {
            $customerName = $customer?->customer_code ?? null;
        }

        $missions = Mission::query()
            ->where('reservation_id', $reservation->id)
            ->with('assignedAgent:id,name,first_name,last_name,email')
            ->orderBy('scheduled_start_at')
            ->get();

        return ApiResponse::success([
            'reservation' => $reservation,
            'customer_name' => $customerName,
            'vehicle_name' => $vehicleName,
            'vehicle_registration' => $vehicle?->registration_number ?? null,
            'missions' => $missions,
            'handover_reports' => $handoverReports,
            'extensions' => $extensions,
            'damage_reports' => $damages,
            'drivers' => $drivers,
            'payments' => $payments,
            'invoices' => $invoices,
            'history' => $history,
            'totals' => [
                'estimated_price' => (float) ($reservation->estimated_price ?? 0),
                'extensions_total' => (float) $extensions->where('status', 'applied')->sum('additional_amount'),
                'damages_total' => (float) $damages->sum(fn ($d) => $d->final_cost ?? $d->estimated_cost ?? 0),
                'paid' => (float) $payments->sum('amount'),
            ],
        ]);
    }

    public function createMission(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'mission_type' => ['required', 'string', 'max:50'],
            'assigned_user_id' => ['nullable', 'uuid'],
            'scheduled_start_at' => ['nullable', 'date'],
            'scheduled_end_at' => ['nullable', 'date'],
            'origin_address' => ['nullable', 'string', 'max:255'],
            'destination_address' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'create_return_mission' => ['nullable', 'boolean'],
            'return_assigned_user_id' => ['nullable', 'uuid'],
            'return_scheduled_at' => ['nullable', 'date'],
            'return_notes' => ['nullable', 'string'],
        ]);

        $existingTypes = Mission::query()
            ->where('reservation_id', $reservation->id)
            ->whereNotIn('status', ['failed'])
            ->pluck('mission_type')
            ->toArray();

        if (in_array($data['mission_type'], $existingTypes, true)) {
            return ApiResponse::error(
                "Une mission de type « {$data['mission_type']} » existe déjà pour cette réservation.",
                422
            );
        }

        if (!empty($data['create_return_mission']) && in_array('pickup', $existingTypes, true)) {
            return ApiResponse::error(
                'Une mission de récupération existe déjà pour cette réservation.',
                422
            );
        }

        $reservation->load(['vehicle.brand', 'vehicle.model', 'customer']);

        $result = DB::transaction(function () use ($reservation, $data) {
            $this->transitionReservation($reservation, 'pickup_scheduled');

            $delivery = Mission::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $reservation->company_id,
                'branch_id' => $reservation->branch_id,
                'reservation_id' => $reservation->id,
                'vehicle_id' => $reservation->vehicle_id,
                'assigned_user_id' => $data['assigned_user_id'] ?? null,
                'mission_type' => $data['mission_type'],
                'status' => 'planned',
                'scheduled_start_at' => $data['scheduled_start_at'] ?? $reservation->desired_start_at,
                'scheduled_end_at' => $data['scheduled_end_at'] ?? $reservation->desired_end_at,
                'origin_address' => $data['origin_address'] ?? $reservation->pickup_address,
                'destination_address' => $data['destination_address'] ?? $reservation->delivery_address,
                'notes' => $data['notes'] ?? null,
                'created_by' => auth()->id(),
            ]);

            $pickup = null;
            if (!empty($data['create_return_mission'])) {
                $pickup = Mission::query()->create([
                    'id' => (string) Str::uuid(),
                    'company_id' => $reservation->company_id,
                    'branch_id' => $reservation->branch_id,
                    'reservation_id' => $reservation->id,
                    'vehicle_id' => $reservation->vehicle_id,
                    'assigned_user_id' => $data['return_assigned_user_id'] ?? $data['assigned_user_id'] ?? null,
                    'mission_type' => 'pickup',
                    'status' => 'planned',
                    'scheduled_start_at' => $data['return_scheduled_at'] ?? $reservation->desired_end_at,
                    'scheduled_end_at' => $data['return_scheduled_at'] ?? $reservation->desired_end_at,
                    'origin_address' => $data['destination_address'] ?? $reservation->delivery_address,
                    'destination_address' => $data['origin_address'] ?? $reservation->pickup_address,
                    'notes' => $data['return_notes'] ?? null,
                    'created_by' => auth()->id(),
                ]);
            }

            return ['delivery' => $delivery, 'pickup' => $pickup];
        });

        $vehicle = $reservation->vehicle;
        $vLabel = $vehicle ? trim(($vehicle->brand?->name ?? $vehicle->brand_name ?? '').' '.($vehicle->model?->model_name ?? $vehicle->model?->name ?? $vehicle->model_name ?? '')) : '';
        $vFull = $vLabel ? "{$vLabel} ({$vehicle->registration_number})" : ($vehicle->registration_number ?? '');
        $customerName = '';
        try { $customerName = $reservation->customer?->displayName() ?? ''; } catch (\Throwable) {}
        $mTypeLabel = $data['mission_type'] === 'pickup' ? 'Récupération' : 'Livraison';

        foreach ([$result['delivery'], $result['pickup']] as $mission) {
            if (!$mission) continue;
            $type = $mission->mission_type === 'pickup' ? 'Récupération' : 'Livraison';
            if ($mission->assigned_user_id) {
                $this->notifications->notifyUser(
                    userId: $mission->assigned_user_id,
                    category: 'ops.mission_assigned',
                    title: "Mission {$type} assignée",
                    body: "Véhicule {$vFull}" . ($customerName ? " — Client {$customerName}" : ''),
                    module: 'operations',
                    priority: 'high',
                    channels: ['in_app', 'email', 'sms'],
                    entity: $reservation,
                    linkUrl: '/missions/' . $mission->id,
                    payload: [
                        'mission_id' => $mission->id,
                        'mission_type' => $mission->mission_type,
                        'vehicle_brand' => $vehicle?->brand_name,
                        'vehicle_model' => $vehicle?->model_name,
                        'registration_number' => $vehicle?->registration_number,
                        'scheduled_start_at' => $mission->scheduled_start_at,
                        'origin_address' => $mission->origin_address,
                        'destination_address' => $mission->destination_address,
                    ],
                );
            }
        }

        return ApiResponse::success(
            $result['pickup'] ? [$result['delivery'], $result['pickup']] : $result['delivery'],
            null, null, 201
        );
    }

    public function agentAvailability(Request $request): JsonResponse
    {
        $data = $request->validate([
            'agent_id' => ['required', 'uuid'],
            'scheduled_at' => ['required', 'date'],
            'exclude_reservation_id' => ['nullable', 'uuid'],
        ]);

        $date = Carbon::parse($data['scheduled_at']);
        $conflicts = Mission::query()
            ->where('assigned_user_id', $data['agent_id'])
            ->where('status', '!=', 'completed')
            ->where('status', '!=', 'failed')
            ->whereDate('scheduled_start_at', $date->toDateString())
            ->when($data['exclude_reservation_id'] ?? null, fn ($q, $rid) => $q->where('reservation_id', '!=', $rid))
            ->with('reservation:id,reservation_number')
            ->orderBy('scheduled_start_at')
            ->get(['id', 'mission_type', 'status', 'scheduled_start_at', 'scheduled_end_at', 'reservation_id']);

        return ApiResponse::success([
            'agent_id' => $data['agent_id'],
            'date' => $date->toDateString(),
            'conflicts' => $conflicts,
            'available' => $conflicts->isEmpty(),
        ]);
    }

    public function confirm(Request $request, Reservation $reservation): JsonResponse
    {
        DB::transaction(function () use ($request, $reservation): void {
            $locked = Reservation::withoutGlobalScopes()
                ->whereKey((string) $reservation->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $this->availability->assertVehicleAvailableWithLock(
                (string) $locked->vehicle_id,
                Carbon::parse($locked->desired_start_at),
                Carbon::parse($locked->desired_end_at),
                (string) $locked->id
            );
            $this->transitionReservation($locked, 'confirmed', $request);
        });

        return ApiResponse::success($reservation->fresh());
    }

    public function cancel(Request $request, Reservation $reservation): JsonResponse
    {
        $this->transitionReservation($reservation, 'cancelled', $request);

        return ApiResponse::success($reservation->fresh());
    }

    public function destroy(Request $request, Reservation $reservation): JsonResponse
    {
        if (! in_array($reservation->status, ['cancelled', 'draft'], true)) {
            return ApiResponse::error('Seules les réservations annulées ou en brouillon peuvent être supprimées.', 422);
        }

        DB::transaction(function () use ($reservation): void {
            // Delete related records
            RentalHandoverReport::where('reservation_id', $reservation->id)->delete();
            RentalExtension::where('reservation_id', $reservation->id)->delete();
            RentalDamageReport::where('reservation_id', $reservation->id)->delete();
            if (\Schema::hasTable('reservation_drivers')) {
                ReservationDriver::where('reservation_id', $reservation->id)->delete();
            }
            Payment::where('reservation_id', $reservation->id)->update(['reservation_id' => null]);
            $reservation->delete();
        });

        AuditLogger::record(
            action: 'reservation_deleted',
            user: $request->user(),
            entityType: 'reservation',
            entityId: $reservation->id,
            module: 'rentals',
        );

        return ApiResponse::success(null, null, 'Réservation supprimée.');
    }

    public function update(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['sometimes', 'uuid'],
            'vehicle_id' => ['sometimes', 'uuid'],
            'reservation_type' => ['sometimes', 'string', 'max:50'],
            'desired_start_at' => ['sometimes', 'date'],
            'desired_end_at' => ['sometimes', 'date'],
            'pickup_address' => ['nullable', 'string', 'max:255'],
            'delivery_address' => ['nullable', 'string', 'max:255'],
            'pickup_location' => ['nullable', 'string', 'max:500'],
            'return_location' => ['nullable', 'string', 'max:500'],
            'delivery_latitude' => ['nullable', 'numeric'],
            'delivery_longitude' => ['nullable', 'numeric'],
            'estimated_price' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:40'],
            'notes' => ['nullable', 'string'],
        ]);

        if (isset($data['payment_method'])) {
            $data['payment_method'] = PaymentMethodNormalizer::normalize($data['payment_method']);
        }

        DB::transaction(function () use ($reservation, $data, $request): void {
            $locked = Reservation::withoutGlobalScopes()
                ->whereKey((string) $reservation->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if (isset($data['vehicle_id']) || isset($data['desired_start_at']) || isset($data['desired_end_at'])) {
                $vehicleId = $data['vehicle_id'] ?? $locked->vehicle_id;
                $startAt = Carbon::parse($data['desired_start_at'] ?? $locked->desired_start_at);
                $endAt = Carbon::parse($data['desired_end_at'] ?? $locked->desired_end_at);
                $this->availability->assertVehicleAvailableWithLock(
                    (string) $vehicleId,
                    $startAt,
                    $endAt,
                    (string) $locked->id
                );
            }

            $locked->fill($data);
            $locked->save();
        });

        AuditLogger::updated($reservation->fresh(), $request->user(), before: [], after: $data, request: $request);

        return ApiResponse::success($reservation->fresh());
    }

    /**
     * Alias for return handover flow (client-facing "return rental").
     */
    public function rentalReturn(Request $request, Reservation $reservation): JsonResponse
    {
        return $this->handoverReturn($request, $reservation);
    }

    public function handoverPickup(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'odometer' => ['nullable', 'numeric', 'min:0'],
            'fuel_level' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'condition_notes' => ['nullable', 'string'],
            'checklist' => ['nullable', 'array'],
            'photos' => ['nullable', 'array'],
            'signature' => ['nullable', 'string'],
            'contract_id' => ['nullable', 'uuid'],
        ]);

        $report = DB::transaction(function () use ($reservation, $data, $request) {
            $this->transitionReservation($reservation, 'handed_over', $request);
            $this->transitionReservation($reservation, 'active', $request);

            return RentalHandoverReport::query()->create([
                'id' => (string) Str::uuid(),
                'vehicle_id' => $reservation->vehicle_id,
                'customer_id' => $reservation->customer_id,
                'reservation_id' => $reservation->id,
                'contract_id' => $data['contract_id'] ?? null,
                'handover_type' => 'pickup',
                'odometer' => $data['odometer'] ?? null,
                'fuel_level' => $data['fuel_level'] ?? null,
                'condition_notes' => $data['condition_notes'] ?? null,
                'checklist' => $data['checklist'] ?? null,
                'photos' => $data['photos'] ?? null,
                'signature' => $data['signature'] ?? null,
                'performed_by' => $request->user()?->id,
                'performed_at' => now(),
            ]);
        });

        return ApiResponse::success($report, null, null, 201);
    }

    public function requestExtension(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'new_end_at' => ['required', 'date', 'after:now'],
            'additional_amount' => ['nullable', 'numeric', 'min:0'],
            'contract_id' => ['nullable', 'uuid'],
            'notes' => ['nullable', 'string'],
        ]);

        $newEnd = Carbon::parse($data['new_end_at']);
        $oldEnd = Carbon::parse($reservation->desired_end_at);

        $ext = DB::transaction(function () use ($reservation, $data, $newEnd, $oldEnd, $request): mixed {
            $locked = Reservation::withoutGlobalScopes()
                ->whereKey((string) $reservation->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $this->availability->assertVehicleAvailableWithLock(
                (string) $locked->vehicle_id,
                Carbon::parse($locked->desired_start_at),
                $newEnd,
                (string) $locked->id
            );
            $this->transitionReservation($locked, 'extension_requested', $request);
            $locked->desired_end_at = $newEnd;
            $locked->save();

            return RentalExtension::query()->create([
                'id' => (string) Str::uuid(),
                'reservation_id' => $locked->id,
                'contract_id' => $data['contract_id'] ?? null,
                'old_end_at' => $oldEnd,
                'new_end_at' => $newEnd,
                'additional_amount' => $data['additional_amount'] ?? 0,
                'status' => 'applied',
                'requested_by' => $request->user()?->id,
                'requested_at' => now(),
                'resolved_at' => now(),
                'resolved_by' => $request->user()?->id,
                'notes' => $data['notes'] ?? null,
            ]);
        });

        return ApiResponse::success($ext, null, null, 201);
    }

    public function handoverReturn(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'odometer' => ['nullable', 'numeric', 'min:0'],
            'fuel_level' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'condition_notes' => ['nullable', 'string'],
            'checklist' => ['nullable', 'array'],
            'photos' => ['nullable', 'array'],
            'signature' => ['nullable', 'string'],
            'contract_id' => ['nullable', 'uuid'],
        ]);

        $report = DB::transaction(function () use ($reservation, $data, $request) {
            $this->transitionReservation($reservation, 'returned', $request);
            $this->transitionReservation($reservation, 'inspection_pending', $request);

            return RentalHandoverReport::query()->create([
                'id' => (string) Str::uuid(),
                'vehicle_id' => $reservation->vehicle_id,
                'customer_id' => $reservation->customer_id,
                'reservation_id' => $reservation->id,
                'contract_id' => $data['contract_id'] ?? null,
                'handover_type' => 'return',
                'odometer' => $data['odometer'] ?? null,
                'fuel_level' => $data['fuel_level'] ?? null,
                'condition_notes' => $data['condition_notes'] ?? null,
                'checklist' => $data['checklist'] ?? null,
                'photos' => $data['photos'] ?? null,
                'signature' => $data['signature'] ?? null,
                'performed_by' => $request->user()?->id,
                'performed_at' => now(),
            ]);
        });

        return ApiResponse::success($report, null, null, 201);
    }

    public function damageReport(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'damage_type' => ['required', 'string', 'max:50'],
            'description' => ['nullable', 'string'],
            'estimated_cost' => ['nullable', 'numeric', 'min:0'],
            'final_cost' => ['nullable', 'numeric', 'min:0'],
            'responsible_party' => ['nullable', 'string', 'max:30'],
            'status' => ['nullable', 'string', 'max:30'],
        ]);

        $row = DB::transaction(function () use ($reservation, $data, $request) {
            $this->transitionReservation($reservation, 'damage_pending', $request);

            return RentalDamageReport::query()->create([
                'id' => (string) Str::uuid(),
                'reservation_id' => $reservation->id,
                'vehicle_id' => $reservation->vehicle_id,
                'customer_id' => $reservation->customer_id,
                'damage_type' => $data['damage_type'],
                'description' => $data['description'] ?? null,
                'estimated_cost' => $data['estimated_cost'] ?? 0,
                'final_cost' => $data['final_cost'] ?? null,
                'responsible_party' => $data['responsible_party'] ?? 'customer',
                'status' => $data['status'] ?? 'open',
            ]);
        });

        return ApiResponse::success($row, null, null, 201);
    }

    public function closeBilling(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'issue_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'currency_code' => ['nullable', 'string', 'size:3'],
        ]);

        $invoice = DB::transaction(function () use ($reservation, $data, $request) {
            $this->transitionReservation($reservation, 'billing_pending', $request);

            $base = (float) ($reservation->estimated_price ?? 0);
            $extensions = (float) RentalExtension::query()
                ->where('reservation_id', $reservation->id)
                ->where('status', 'applied')
                ->sum('additional_amount');
            $damages = (float) RentalDamageReport::query()
                ->where('reservation_id', $reservation->id)
                ->sum(DB::raw('COALESCE(final_cost, estimated_cost)'));
            $total = max(0, $base + $extensions + $damages);

            $invoice = Invoice::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $reservation->company_id,
                'branch_id' => $reservation->branch_id,
                'invoice_number' => $this->generateRentalInvoiceNumber(),
                'invoice_type' => 'service',
                'customer_id' => $reservation->customer_id,
                'contract_id' => null,
                'issue_date' => $data['issue_date'] ?? now()->toDateString(),
                'due_date' => $data['due_date'] ?? now()->addDays(7)->toDateString(),
                'currency_code' => $data['currency_code'] ?? 'MAD',
                'status' => 'draft',
                'created_by' => $request->user()?->id,
            ]);

            InvoiceLine::query()->create([
                'id' => (string) Str::uuid(),
                'invoice_id' => $invoice->id,
                'position' => 1,
                'line_type' => 'service',
                'description' => 'Clôture location '.$reservation->reservation_number,
                'quantity' => 1,
                'unit_price' => $total,
                'discount_amount' => 0,
                'tax_rate' => 0,
                'tax_amount' => 0,
                'line_total' => $total,
                'metadata' => [
                    'reservation_id' => $reservation->id,
                    'base_amount' => $base,
                    'extensions' => $extensions,
                    'damages' => $damages,
                ],
            ]);
            $invoice->refresh();
            $invoice->recalculateTotals();
            $invoice->save();

            RentalDamageReport::query()
                ->where('reservation_id', $reservation->id)
                ->whereNull('linked_invoice_id')
                ->update(['linked_invoice_id' => $invoice->id, 'status' => 'invoiced']);

            $this->transitionReservation($reservation, 'closed', $request);

            return $invoice;
        });

        return ApiResponse::success($invoice->fresh('lines'), null, null, 201);
    }

    // ── Driver CRUD ──────────────────────────────────────────────────────

    public function storeDriver(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'driver_type'              => ['sometimes', 'string', 'in:primary,secondary'],
            'first_name'               => ['required', 'string', 'max:100'],
            'last_name'                => ['required', 'string', 'max:100'],
            'phone'                    => ['nullable', 'string', 'max:30'],
            'email'                    => ['nullable', 'email', 'max:255'],
            'cin_passport'             => ['nullable', 'string', 'max:50'],
            'license_number'           => ['nullable', 'string', 'max:50'],
            'license_expiry'           => ['nullable', 'date'],
            'relationship'             => ['nullable', 'string', 'max:50'],
            'is_contract_signer'       => ['nullable', 'boolean'],
            'is_financially_responsible' => ['nullable', 'boolean'],
        ]);

        $driver = ReservationDriver::query()->create([
            'id'             => (string) Str::uuid(),
            'reservation_id' => $reservation->id,
            ...$data,
        ]);

        return ApiResponse::success($driver, null, null, 201);
    }

    public function updateDriver(Request $request, Reservation $reservation, string $driverId): JsonResponse
    {
        $driver = ReservationDriver::query()
            ->where('reservation_id', $reservation->id)
            ->where('id', $driverId)
            ->firstOrFail();

        $data = $request->validate([
            'driver_type'              => ['sometimes', 'string', 'in:primary,secondary'],
            'first_name'               => ['sometimes', 'string', 'max:100'],
            'last_name'                => ['sometimes', 'string', 'max:100'],
            'phone'                    => ['nullable', 'string', 'max:30'],
            'email'                    => ['nullable', 'email', 'max:255'],
            'cin_passport'             => ['nullable', 'string', 'max:50'],
            'license_number'           => ['nullable', 'string', 'max:50'],
            'license_expiry'           => ['nullable', 'date'],
            'relationship'             => ['nullable', 'string', 'max:50'],
            'is_contract_signer'       => ['nullable', 'boolean'],
            'is_financially_responsible' => ['nullable', 'boolean'],
        ]);

        $driver->fill($data);
        $driver->save();

        return ApiResponse::success($driver);
    }

    public function destroyDriver(Request $request, Reservation $reservation, string $driverId): JsonResponse
    {
        $driver = ReservationDriver::query()
            ->where('reservation_id', $reservation->id)
            ->where('id', $driverId)
            ->firstOrFail();

        $driver->delete();

        return ApiResponse::success(null, null, 'Driver removed.');
    }

    // ── Status transitions ─────────────────────────────────────────────

    private function transitionReservation(Reservation $reservation, string $to, ?Request $request = null): void
    {
        if (! in_array($to, self::FLOW, true)) {
            abort(422, 'Invalid rental status transition target.');
        }
        $from = (string) $reservation->status;
        if ($from === $to) {
            return;
        }
        $reservation->status = $to;
        $reservation->save();
        AuditLogger::statusChanged($reservation, $from, $to, $request?->user(), $request, module: 'rentals');
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

    private function generateRentalInvoiceNumber(): string
    {
        $latest = Invoice::query()
            ->where('invoice_number', 'like', 'FAC-%')
            ->orderByRaw("CAST(SUBSTRING(invoice_number, 5) AS UNSIGNED) DESC")
            ->value('invoice_number');

        $seq = 1;
        if ($latest && preg_match('/^FAC-(\d+)$/', $latest, $m)) {
            $seq = (int) $m[1] + 1;
        }

        return 'FAC-' . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }
}

