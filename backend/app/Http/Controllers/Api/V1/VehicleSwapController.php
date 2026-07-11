<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Contract;
use App\Models\Mission;
use App\Models\Reservation;
use App\Models\Vehicle;
use App\Models\VehicleSwapRequest;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\RentalAvailabilityService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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
            ->with(['oldVehicle.brand', 'oldVehicle.model', 'newVehicle.brand', 'newVehicle.model'])
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
            'new_rate' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:1000'],
            'create_missions' => ['nullable', 'boolean'],
            'old_vehicle_recovered' => ['nullable', 'boolean'],
            'financial_action' => ['nullable', 'string', 'in:charge,free_upgrade,refund,ignore'],
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

            // Update vehicle availability statuses
            if ($oldVehicleId) {
                Vehicle::where('id', $oldVehicleId)->update(['availability_status' => 'available']);
            }
            Vehicle::where('id', $data['new_vehicle_id'])->update(['availability_status' => 'in_use']);

            // Perform the swap
            $contractUpdate = ['vehicle_id' => $data['new_vehicle_id']];
            if (!empty($data['new_rate'])) {
                $contractUpdate['base_amount'] = $data['new_rate'];
            }
            if (!empty($data['contract_id'])) {
                Contract::where('id', $data['contract_id'])->update($contractUpdate);
            }
            if (!empty($data['reservation_id'])) {
                Reservation::withoutGlobalScopes()->where('id', $data['reservation_id'])->update(['vehicle_id' => $data['new_vehicle_id']]);

                // Also update the linked contract if one exists
                $linkedContract = Contract::withoutGlobalScopes()
                    ->where('customer_id', $customerId)
                    ->where('vehicle_id', $oldVehicleId)
                    ->whereNotIn('status', ['cancelled', 'terminated'])
                    ->first();
                if ($linkedContract) {
                    $linkedContract->update($contractUpdate);
                    $data['contract_id'] = $linkedContract->id;
                }
            }

            $swapReason = $data['reason'] ?? null;
            if (!empty($data['note'])) {
                $swapReason = $swapReason ? "{$swapReason} — {$data['note']}" : $data['note'];
            }

            // Create audit record
            $swap = VehicleSwapRequest::create([
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'contract_id' => $data['contract_id'] ?? null,
                'reservation_id' => $data['reservation_id'] ?? null,
                'customer_id' => $customerId,
                'old_vehicle_id' => $oldVehicleId,
                'new_vehicle_id' => $data['new_vehicle_id'],
                'status' => 'approved',
                'reason' => $swapReason,
                'requested_by' => $request->user()?->id,
                'resolved_by' => $request->user()?->id,
                'requested_at' => now(),
                'resolved_at' => now(),
            ]);

            // Auto-create missions if requested
            if (! empty($data['create_missions'])) {
                $reservationForMission = isset($reservation) ? $reservation : null;
                $branchId = $reservationForMission?->branch_id ?? ($contract->branch_id ?? null);
                $originAddr = $reservationForMission?->pickup_address ?? null;
                $destAddr = $reservationForMission?->delivery_address ?? null;

                if (empty($data['old_vehicle_recovered'])) {
                    Mission::create([
                        'id' => (string) Str::uuid(),
                        'company_id' => $companyId,
                        'branch_id' => $branchId,
                        'reservation_id' => $data['reservation_id'] ?? null,
                        'contract_id' => $data['contract_id'] ?? null,
                        'vehicle_id' => $oldVehicleId,
                        'client_id' => $customerId,
                        'mission_type' => 'recovery',
                        'status' => 'planned',
                        'priority' => 'high',
                        'scheduled_start_at' => now(),
                        'scheduled_end_at' => now()->addHours(2),
                        'origin_address' => $destAddr,
                        'destination_address' => $originAddr,
                        'notes' => 'Récupération véhicule — changement de véhicule',
                        'created_by' => $request->user()?->id,
                    ]);
                }

                Mission::create([
                    'id' => (string) Str::uuid(),
                    'company_id' => $companyId,
                    'branch_id' => $branchId,
                    'reservation_id' => $data['reservation_id'] ?? null,
                    'contract_id' => $data['contract_id'] ?? null,
                    'vehicle_id' => $data['new_vehicle_id'],
                    'client_id' => $customerId,
                    'mission_type' => 'delivery',
                    'status' => 'planned',
                    'priority' => 'high',
                    'scheduled_start_at' => now(),
                    'scheduled_end_at' => now()->addHours(2),
                    'origin_address' => $originAddr,
                    'destination_address' => $destAddr,
                    'notes' => 'Livraison véhicule de remplacement — changement de véhicule',
                    'created_by' => $request->user()?->id,
                ]);
            }

            return $swap;
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

            // Update vehicle availability statuses
            if ($swap->old_vehicle_id) {
                Vehicle::where('id', $swap->old_vehicle_id)->update(['availability_status' => 'available']);
            }
            Vehicle::where('id', $swap->new_vehicle_id)->update(['availability_status' => 'in_use']);

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

    /**
     * List vehicles eligible for swap, categorised by recommendation.
     */
    public function eligibleVehicles(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reservation_id' => ['nullable', 'uuid'],
            'contract_id' => ['nullable', 'uuid'],
        ]);

        if (empty($data['reservation_id']) && empty($data['contract_id'])) {
            return ApiResponse::error('Un contrat ou une réservation est requis.', 422);
        }

        $currentVehicleId = null;
        $branchId = null;
        $companyId = null;
        $startAt = null;
        $endAt = null;
        $excludeReservationId = null;
        $excludeContractId = null;

        if (! empty($data['reservation_id'])) {
            $reservation = Reservation::withoutGlobalScopes()->findOrFail($data['reservation_id']);
            $currentVehicleId = $reservation->vehicle_id;
            $branchId = $reservation->branch_id;
            $companyId = $reservation->company_id;
            $startAt = Carbon::parse($reservation->desired_start_at);
            $endAt = Carbon::parse($reservation->desired_end_at);
            $excludeReservationId = $reservation->id;
        } elseif (! empty($data['contract_id'])) {
            $contract = Contract::findOrFail($data['contract_id']);
            $currentVehicleId = $contract->vehicle_id;
            $branchId = $contract->branch_id;
            $companyId = $contract->company_id;
            $startAt = Carbon::parse($contract->start_date);
            $endAt = $contract->end_date
                ? Carbon::parse($contract->end_date)
                : Carbon::parse($contract->start_date)->addMonths($contract->duration_months ?? 12);
            $excludeContractId = $contract->id;
        }

        $currentVehicle = Vehicle::with(['brand', 'model'])->find($currentVehicleId);
        $currentPrice = (float) ($currentVehicle?->daily_rental_price ?? 0);
        $currentGamme = $currentVehicle?->gamme ?? '';
        $currentCategorie = $currentVehicle?->categorie ?? '';

        $vehicles = Vehicle::with(['brand', 'model'])
            ->where('id', '!=', $currentVehicleId)
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->whereNotIn('status', ['SOLD', 'SCRAPPED'])
            ->get();

        $recommended = [];
        $upgrade = [];
        $downgrade = [];
        $all = [];

        foreach ($vehicles as $v) {
            $avail = $this->availability->checkVehicleAvailability(
                $v->id,
                $startAt,
                $endAt,
                $excludeReservationId,
                $excludeContractId,
            );

            $item = $this->formatVehicleForSwap($v, $avail);
            $all[] = $item;

            if (! $avail['available']) {
                continue;
            }

            $vPrice = (float) ($v->daily_rental_price ?? 0);
            $sameCategory = (
                ($currentGamme && $v->gamme === $currentGamme)
                || ($currentCategorie && $v->categorie === $currentCategorie)
            );
            $sameBranch = $branchId && $v->branch_id === $branchId;

            if ($sameCategory && $sameBranch) {
                $recommended[] = $item;
            }
            if ($vPrice > $currentPrice) {
                $upgrade[] = $item;
            }
            if ($vPrice < $currentPrice) {
                $downgrade[] = $item;
            }
        }

        $remainingDays = max(0, (int) now()->startOfDay()->diffInDays($endAt->copy()->startOfDay(), false));

        return ApiResponse::success([
            'current_vehicle' => $currentVehicle ? $this->formatVehicleForSwap($currentVehicle, ['available' => true, 'reasons' => []]) : null,
            'categories' => [
                'recommended' => $recommended,
                'upgrade' => $upgrade,
                'downgrade' => $downgrade,
                'all' => $all,
            ],
            'rental_period' => [
                'start' => $startAt->toDateTimeString(),
                'end' => $endAt->toDateTimeString(),
                'remaining_days' => $remainingDays,
            ],
        ]);
    }

    /**
     * Calculate financial impact of a vehicle swap.
     */
    public function financialImpact(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reservation_id' => ['nullable', 'uuid'],
            'contract_id' => ['nullable', 'uuid'],
            'new_vehicle_id' => ['required', 'uuid'],
        ]);

        if (empty($data['reservation_id']) && empty($data['contract_id'])) {
            return ApiResponse::error('Un contrat ou une réservation est requis.', 422);
        }

        $currentVehicleId = null;
        $endAt = null;

        if (! empty($data['reservation_id'])) {
            $reservation = Reservation::withoutGlobalScopes()->findOrFail($data['reservation_id']);
            $currentVehicleId = $reservation->vehicle_id;
            $endAt = Carbon::parse($reservation->desired_end_at);
        } elseif (! empty($data['contract_id'])) {
            $contract = Contract::findOrFail($data['contract_id']);
            $currentVehicleId = $contract->vehicle_id;
            $endAt = $contract->end_date
                ? Carbon::parse($contract->end_date)
                : Carbon::parse($contract->start_date)->addMonths($contract->duration_months ?? 12);
        }

        $oldVehicle = Vehicle::find($currentVehicleId);
        $newVehicle = Vehicle::findOrFail($data['new_vehicle_id']);

        $oldRate = (float) ($oldVehicle?->daily_rental_price ?? 0);
        $newRate = (float) ($newVehicle->daily_rental_price ?? 0);
        $remainingDays = max(0, (int) now()->startOfDay()->diffInDays($endAt->copy()->startOfDay(), false));
        $totalDifference = round(($newRate - $oldRate) * $remainingDays, 2);

        return ApiResponse::success([
            'old_daily_rate' => $oldRate,
            'new_daily_rate' => $newRate,
            'remaining_days' => $remainingDays,
            'total_difference' => $totalDifference,
            'currency' => 'MAD',
        ]);
    }

    private function formatVehicleForSwap(Vehicle $v, array $avail): array
    {
        $photoUrl = null;
        if ($v->photo_file_id) {
            $file = DB::table('files')->where('id', $v->photo_file_id)->first();
            if ($file) {
                try {
                    $photoUrl = Storage::disk($file->storage_disk)->url($file->storage_path);
                } catch (\Throwable) {}
            }
        }

        return [
            'id' => $v->id,
            'brand_name' => $v->brand?->name ?? $v->brand_name,
            'model_name' => $v->model?->model_name ?? $v->model?->name ?? $v->model_name,
            'registration_number' => $v->registration_number,
            'categorie' => $v->categorie,
            'gamme' => $v->gamme,
            'vehicle_type' => $v->vehicle_type,
            'daily_rental_price' => $v->daily_rental_price ? (float) $v->daily_rental_price : null,
            'mileage_current' => $v->mileage_current ? (int) $v->mileage_current : null,
            'fuel_type' => $v->fuel_type,
            'transmission' => $v->transmission,
            'branch_id' => $v->branch_id,
            'availability_status' => $v->availability_status,
            'photo_url' => $photoUrl,
            'current_location' => $v->current_location,
            'available' => $avail['available'],
            'availability_reasons' => $avail['reasons'] ?? [],
        ];
    }
}
