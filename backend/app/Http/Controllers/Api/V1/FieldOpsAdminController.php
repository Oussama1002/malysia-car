<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Mission;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Admin / Manager endpoints for field operations.
 *
 * Separated from `MobileOpsController` (agent workflow) to keep concerns clean.
 * Only ADMIN, DIRECTEUR, and GESTIONNAIRE_FLOTTE roles can access these.
 */
class FieldOpsAdminController extends Controller
{
    public function __construct(private NotificationService $notifications)
    {
    }

    /**
     * GET /api/v1/mobile-ops/admin/missions
     *
     * Paginated, filterable list for admin monitoring.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Mission::query()
            ->with([
                'vehicle:id,registration_number',
                'assignedAgent:id,email',
                'client:id,customer_code,customer_type',
            ])
            ->withCount(['photos', 'inspections', 'issues'])
            ->orderByDesc('planned_at')
            ->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($type = $request->query('mission_type')) {
            $query->where('mission_type', $type);
        }
        if ($agentId = $request->query('assigned_user_id')) {
            $query->where('assigned_user_id', $agentId);
        }
        if ($vehicleId = $request->query('vehicle_id')) {
            $query->where('vehicle_id', $vehicleId);
        }
        if ($clientId = $request->query('client_id')) {
            $query->where('client_id', $clientId);
        }
        if ($from = $request->query('date_from')) {
            $query->where('planned_at', '>=', $from);
        }
        if ($to = $request->query('date_to')) {
            $query->where('planned_at', '<=', $to . ' 23:59:59');
        }
        if ($q = $request->query('q')) {
            $query->where(function ($qb) use ($q) {
                $qb->where('mission_number', 'like', "%{$q}%")
                    ->orWhere('notes', 'like', "%{$q}%");
            });
        }

        $per = min(100, max(1, (int) $request->query('per_page', 25)));
        $page = $query->paginate($per);

        return ApiResponse::success($page->items(), [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'total' => $page->total(),
        ]);
    }

    /**
     * POST /api/v1/mobile-ops/admin/missions
     *
     * Create a new field mission.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mission_type' => ['required', 'string', 'in:delivery,pickup,check_in,check_out,inspection,assistance'],
            'vehicle_id' => ['nullable', 'uuid'],
            'client_id' => ['nullable', 'uuid'],
            'reservation_id' => ['nullable', 'uuid'],
            'contract_id' => ['nullable', 'uuid'],
            'assigned_user_id' => ['nullable', 'uuid'],
            'pickup_address' => ['nullable', 'string', 'max:500'],
            'dropoff_address' => ['nullable', 'string', 'max:500'],
            'planned_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $user = $request->user();
        $status = ! empty($data['assigned_user_id']) ? 'assigned' : 'pending';

        $mission = Mission::create([
            'company_id' => $user->company_id ?? null,
            'branch_id' => $user->branch_id ?? null,
            'mission_type' => $data['mission_type'],
            'vehicle_id' => $data['vehicle_id'] ?? null,
            'client_id' => $data['client_id'] ?? null,
            'reservation_id' => $data['reservation_id'] ?? null,
            'contract_id' => $data['contract_id'] ?? null,
            'assigned_user_id' => $data['assigned_user_id'] ?? null,
            'pickup_address' => $data['pickup_address'] ?? null,
            'dropoff_address' => $data['dropoff_address'] ?? null,
            'origin_address' => $data['pickup_address'] ?? null,
            'destination_address' => $data['dropoff_address'] ?? null,
            'planned_at' => $data['planned_at'] ?? null,
            'scheduled_start_at' => $data['planned_at'] ?? null,
            'notes' => $data['notes'] ?? null,
            'status' => $status,
            'created_by' => $user->id,
        ]);

        AuditLogger::created($mission, $user, null, 'mobile_ops', $request);

        // Notify the assigned agent
        if ($mission->assigned_user_id) {
            $this->notifyAgent($mission, 'mission_assigned', 'Nouvelle mission assignée',
                "Mission {$mission->mission_number} ({$mission->mission_type}) vous a été assignée.");
        }

        return ApiResponse::success($mission, null, null, 201);
    }

    /**
     * POST /api/v1/mobile-ops/admin/missions/{mission}/assign
     *
     * Assign or reassign an agent to a mission.
     */
    public function assign(Request $request, Mission $mission): JsonResponse
    {
        $data = $request->validate([
            'assigned_user_id' => ['required', 'uuid'],
        ]);

        $previousAgent = $mission->assigned_user_id;
        $previousStatus = $mission->status;

        $mission->assigned_user_id = $data['assigned_user_id'];
        if (in_array($mission->status, ['pending'], true)) {
            $mission->status = 'assigned';
        }
        $mission->save();

        AuditLogger::statusChanged(
            $mission,
            $previousStatus,
            $mission->status,
            $request->user(),
            $request,
            'mobile_ops',
            false,
            $previousAgent ? 'Réassignation agent' : 'Assignation agent',
        );

        $this->notifyAgent($mission, 'mission_assigned', 'Mission assignée',
            "Mission {$mission->mission_number} vous a été assignée.");

        return ApiResponse::success($mission);
    }

    /**
     * POST /api/v1/mobile-ops/admin/missions/{mission}/cancel
     */
    public function cancel(Request $request, Mission $mission): JsonResponse
    {
        if (in_array($mission->status, ['completed', 'cancelled'], true)) {
            return ApiResponse::error('Impossible d\'annuler une mission déjà terminée ou annulée.', 422);
        }

        $previous = $mission->status;
        $mission->status = 'cancelled';
        $mission->notes = trim(($mission->notes ?? '') . "\n[Annulée] " . ($request->input('notes') ?? ''));
        $mission->save();

        AuditLogger::statusChanged($mission, $previous, 'cancelled', $request->user(), $request, 'mobile_ops', false, 'Mission annulée');

        if ($mission->assigned_user_id) {
            $this->notifyAgent($mission, 'mission_cancelled', 'Mission annulée',
                "Mission {$mission->mission_number} a été annulée.");
        }

        return ApiResponse::success($mission);
    }

    /**
     * GET /api/v1/mobile-ops/admin/missions/{mission}/proof
     *
     * Returns all evidence for a mission: photos, inspections, signatures, issues, checklist.
     */
    public function proof(Mission $mission): JsonResponse
    {
        $mission->load(['photos', 'inspections', 'signatures', 'issues', 'checklistItems']);

        $photosByPhase = [];
        foreach ($mission->photos as $p) {
            $phase = $p->phase ?? 'other';
            $photosByPhase[$phase][] = $p;
        }

        return ApiResponse::success([
            'mission_id' => $mission->id,
            'mission_number' => $mission->mission_number,
            'photos_by_phase' => $photosByPhase,
            'photos_count' => $mission->photos->count(),
            'inspections' => $mission->inspections,
            'signatures' => $mission->signatures,
            'issues' => $mission->issues,
            'checklist' => $mission->checklistItems,
        ]);
    }

    private function notifyAgent(Mission $mission, string $category, string $title, string $body): void
    {
        try {
            if (! $mission->assigned_user_id) {
                return;
            }
            $this->notifications->notifyUsers(
                userIds: [$mission->assigned_user_id],
                category: $category,
                title: $title,
                body: $body,
                module: 'mobile_ops',
                priority: 'high',
                channels: ['in_app'],
                entity: $mission,
            );
        } catch (\Throwable $e) {
            \Log::warning('field_ops_admin.notify_failed', [
                'category' => $category,
                'mission' => $mission->id,
                'err' => $e->getMessage(),
            ]);
        }
    }
}
