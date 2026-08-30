<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Contract;
use App\Models\Reservation;
use App\Models\VehicleSwapRequest;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\RentalAvailabilityService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class VehicleSwapController extends Controller
{
    public function __construct(
        private readonly RentalAvailabilityService $availability,
        private readonly NotificationService $notifications,
    ) {}

    /**
     * List swap requests for a contract or reservation.
     */
    public function index(Request $request): JsonResponse
    {
        $q = VehicleSwapRequest::query()
            ->with([
                'oldVehicle.brand', 'oldVehicle.model',
                'newVehicle.brand', 'newVehicle.model',
                'requestedByUser:id,first_name,last_name,email',
                'resolvedByUser:id,first_name,last_name,email',
            ])
            ->orderByDesc('requested_at');

        if ($contractId = $request->query('contract_id')) {
            $q->where('contract_id', $contractId);
        }
        if ($reservationId = $request->query('reservation_id')) {
            $q->where('reservation_id', $reservationId);
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }

        return ApiResponse::success($q->limit(100)->get());
    }

    /**
     * Create a swap request (pending approval).
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'contract_id' => ['nullable', 'uuid'],
            'reservation_id' => ['nullable', 'uuid'],
            'new_vehicle_id' => ['required', 'uuid'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        if (empty($data['contract_id']) && empty($data['reservation_id'])) {
            return ApiResponse::error('Un contrat ou une réservation est requis.', 422);
        }

        // Resolve source entity
        $customerId = null;
        $oldVehicleId = null;
        $companyId = null;
        $startAt = null;
        $endAt = null;

        if (!empty($data['contract_id'])) {
            $contract = Contract::findOrFail($data['contract_id']);
            $customerId = $contract->customer_id;
            $oldVehicleId = $contract->vehicle_id;
            $companyId = $contract->company_id;
            $startAt = $contract->start_date;
            $endAt = $contract->end_date ?? Carbon::parse($contract->start_date)->addMonths($contract->duration_months ?? 12)->toDateString();
        } elseif (!empty($data['reservation_id'])) {
            $reservation = Reservation::findOrFail($data['reservation_id']);
            $customerId = $reservation->customer_id;
            $oldVehicleId = $reservation->vehicle_id;
            $companyId = $reservation->company_id;
            $startAt = $reservation->desired_start_at;
            $endAt = $reservation->desired_end_at;
        }

        if ($oldVehicleId === $data['new_vehicle_id']) {
            return ApiResponse::error('Le nouveau véhicule doit être différent de l\'actuel.', 422);
        }

        $swap = VehicleSwapRequest::create([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'contract_id' => $data['contract_id'] ?? null,
            'reservation_id' => $data['reservation_id'] ?? null,
            'customer_id' => $customerId,
            'old_vehicle_id' => $oldVehicleId,
            'new_vehicle_id' => $data['new_vehicle_id'],
            'status' => 'pending',
            'reason' => $data['reason'] ?? null,
            'requested_by' => $request->user()?->id,
            'requested_at' => now(),
        ]);

        // Notify admins
        try {
            $this->notifications->notifyRoles(
                ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
                'vehicle_swap_requested',
                'Demande de changement de véhicule',
                "Un changement de véhicule a été demandé. Motif : " . ($data['reason'] ?? 'Non précisé'),
                'fleet',
                'normal',
                entity: $swap,
            );
        } catch (\Throwable) {}

        AuditLogger::record(
            action: 'vehicle_swap_requested',
            user: $request->user(),
            entityType: $swap->getMorphClass(),
            entityId: $swap->id,
            module: 'fleet',
            after: ['old_vehicle_id' => $oldVehicleId, 'new_vehicle_id' => $data['new_vehicle_id']],
        );

        return ApiResponse::success($swap->load(['oldVehicle.brand', 'oldVehicle.model', 'newVehicle.brand', 'newVehicle.model']), null, null, 201);
    }

    /**
     * Instant swap — approve immediately (admin action).
     */
    public function approveInstant(Request $request): JsonResponse
    {
        $data = $request->validate([
            'contract_id' => ['nullable', 'uuid'],
            'reservation_id' => ['nullable', 'uuid'],
            'new_vehicle_id' => ['required', 'uuid'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        if (empty($data['contract_id']) && empty($data['reservation_id'])) {
            return ApiResponse::error('Un contrat ou une réservation est requis.', 422);
        }

        $swap = DB::transaction(function () use ($data, $request) {
            $customerId = null;
            $oldVehicleId = null;
            $companyId = null;
            $startAt = null;
            $endAt = null;

            if (!empty($data['contract_id'])) {
                $contract = Contract::lockForUpdate()->findOrFail($data['contract_id']);
                $customerId = $contract->customer_id;
                $oldVehicleId = $contract->vehicle_id;
                $companyId = $contract->company_id;
                $startAt = $contract->start_date;
                $endAt = $contract->end_date ?? Carbon::parse($contract->start_date)->addMonths($contract->duration_months ?? 12)->toDateString();
            } elseif (!empty($data['reservation_id'])) {
                $reservation = Reservation::withoutGlobalScopes()->lockForUpdate()->findOrFail($data['reservation_id']);
                $customerId = $reservation->customer_id;
                $oldVehicleId = $reservation->vehicle_id;
                $companyId = $reservation->company_id;
                $startAt = $reservation->desired_start_at;
                $endAt = $reservation->desired_end_at;
            }

            if ($oldVehicleId === $data['new_vehicle_id']) {
                abort(422, 'Le nouveau véhicule doit être différent.');
            }

            // Check availability of new vehicle
            $this->availability->assertVehicleAvailableWithLock(
                $data['new_vehicle_id'],
                Carbon::parse($startAt),
                Carbon::parse($endAt),
                $data['reservation_id'] ?? null
            );

            // Perform the swap
            if (!empty($data['contract_id'])) {
                Contract::where('id', $data['contract_id'])->update(['vehicle_id' => $data['new_vehicle_id']]);
            }
            if (!empty($data['reservation_id'])) {
                Reservation::withoutGlobalScopes()->where('id', $data['reservation_id'])->update(['vehicle_id' => $data['new_vehicle_id']]);
            }

            // Create audit record
            return VehicleSwapRequest::create([
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'contract_id' => $data['contract_id'] ?? null,
                'reservation_id' => $data['reservation_id'] ?? null,
                'customer_id' => $customerId,
                'old_vehicle_id' => $oldVehicleId,
                'new_vehicle_id' => $data['new_vehicle_id'],
                'status' => 'approved',
                'reason' => $data['reason'] ?? null,
                'requested_by' => $request->user()?->id,
                'resolved_by' => $request->user()?->id,
                'requested_at' => now(),
                'resolved_at' => now(),
            ]);
        });

        // Notifications
        try {
            $this->notifications->notifyRoles(
                ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
                'vehicle_swap_approved',
                'Changement de véhicule validé',
                'Le véhicule a été changé avec succès. L\'ancien véhicule est de nouveau disponible.',
                'fleet',
                'normal',
                entity: $swap,
            );
        } catch (\Throwable) {}

        AuditLogger::record(
            action: 'vehicle_swap_approved_instant',
            user: $request->user(),
            entityType: $swap->getMorphClass(),
            entityId: $swap->id,
            module: 'fleet',
            after: ['old_vehicle_id' => $swap->old_vehicle_id, 'new_vehicle_id' => $swap->new_vehicle_id],
        );

        return ApiResponse::success($swap->load(['oldVehicle.brand', 'oldVehicle.model', 'newVehicle.brand', 'newVehicle.model']), null, null, 201);
    }

    /**
     * Approve a pending swap request.
     */
    public function approve(Request $request, VehicleSwapRequest $swap): JsonResponse
    {
        if ($swap->status !== 'pending') {
            return ApiResponse::error('Cette demande a déjà été traitée.', 422);
        }

        DB::transaction(function () use ($swap, $request): void {
            $startAt = null;
            $endAt = null;

            if ($swap->contract_id) {
                $contract = Contract::lockForUpdate()->findOrFail($swap->contract_id);
                $startAt = $contract->start_date;
                $endAt = $contract->end_date ?? Carbon::parse($contract->start_date)->addMonths($contract->duration_months ?? 12)->toDateString();
            } elseif ($swap->reservation_id) {
                $reservation = Reservation::withoutGlobalScopes()->lockForUpdate()->findOrFail($swap->reservation_id);
                $startAt = $reservation->desired_start_at;
                $endAt = $reservation->desired_end_at;
            }

            // Check availability
            $this->availability->assertVehicleAvailableWithLock(
                $swap->new_vehicle_id,
                Carbon::parse($startAt),
                Carbon::parse($endAt),
                $swap->reservation_id
            );

            // Perform swap
            if ($swap->contract_id) {
                Contract::where('id', $swap->contract_id)->update(['vehicle_id' => $swap->new_vehicle_id]);
            }
            if ($swap->reservation_id) {
                Reservation::withoutGlobalScopes()->where('id', $swap->reservation_id)->update(['vehicle_id' => $swap->new_vehicle_id]);
            }

            $swap->update([
                'status' => 'approved',
                'resolved_by' => $request->user()?->id,
                'resolved_at' => now(),
            ]);
        });

        try {
            $this->notifications->notifyRoles(
                ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
                'vehicle_swap_approved',
                'Changement de véhicule validé',
                'La demande de changement de véhicule a été approuvée.',
                'fleet',
                'normal',
                entity: $swap,
            );
        } catch (\Throwable) {}

        return ApiResponse::success($swap->fresh()->load(['oldVehicle.brand', 'oldVehicle.model', 'newVehicle.brand', 'newVehicle.model']));
    }

    /**
     * Reject a pending swap request.
     */
    public function reject(Request $request, VehicleSwapRequest $swap): JsonResponse
    {
        if ($swap->status !== 'pending') {
            return ApiResponse::error('Cette demande a déjà été traitée.', 422);
        }

        $data = $request->validate([
            'rejection_reason' => ['nullable', 'string', 'max:500'],
        ]);

        $swap->update([
            'status' => 'rejected',
            'rejection_reason' => $data['rejection_reason'] ?? null,
            'resolved_by' => $request->user()?->id,
            'resolved_at' => now(),
        ]);

        try {
            $this->notifications->notifyRoles(
                ['ADMIN', 'DIRECTEUR'],
                'vehicle_swap_rejected',
                'Changement de véhicule refusé',
                'La demande de changement de véhicule a été refusée.' . ($data['rejection_reason'] ? " Motif : {$data['rejection_reason']}" : ''),
                'fleet',
                'normal',
                entity: $swap,
            );
        } catch (\Throwable) {}

        return ApiResponse::success($swap->fresh());
    }
}
