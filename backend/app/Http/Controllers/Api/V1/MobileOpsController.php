<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Mission;
use App\Models\MissionChecklistItem;
use App\Models\MissionPhoto;
use App\Models\Reservation;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Phase 3 — Mobile Ops.
 *
 * Layered on top of the existing `MissionController` to provide a *role-aware*
 * surface under `/api/v1/mobile-ops/*`. The classic `/api/v1/missions/*` routes
 * stay unchanged for back-office consumers (GESTIONNAIRE_FLOTTE dashboards,
 * reporting); this controller adds the field-agent and customer-portal
 * journeys plus mission audit + notifications.
 *
 * Row-scoping rules (enforced inside the controller, not in middleware):
 *   - AGENT_LIVRAISON  → can only see/act on missions where assigned_user_id
 *                         matches their user_id.
 *   - GESTIONNAIRE_FLOTTE → sees all active missions in their tenant.
 *   - CLIENT_PORTAL    → can ONLY hit `customerTracking()`; calls to mission
 *                         endpoints return 404 (mission directory is internal).
 *   - ADMIN / DIRECTEUR → unrestricted.
 */
class MobileOpsController extends Controller
{
    public function __construct(private NotificationService $notifications)
    {
    }

    /* =================== Listing =================== */

    /**
     * `GET /api/v1/mobile-ops/my-missions`
     *
     * Returns the missions visible to the caller per the rules above.
     * AGENT_LIVRAISON gets only their assigned missions; GESTIONNAIRE_FLOTTE
     * gets all active ones; admins get the full list.
     */
    public function myMissions(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = (string) ($user->role ?? '');

        $query = Mission::query()->orderByDesc('updated_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($role === 'AGENT_LIVRAISON') {
            $query->where('assigned_user_id', (string) $user->id);
        } elseif ($role === 'GESTIONNAIRE_FLOTTE') {
            // Default monitoring view: only active work unless caller asks for all.
            if (! $request->query('include_all')) {
                $query->whereIn('status', ['planned', 'in_progress']);
            }
        } elseif (! in_array($role, ['ADMIN', 'DIRECTEUR'], true)) {
            // No other internal role should be hitting this endpoint.
            abort(403);
        }

        $per = min(100, max(1, (int) $request->query('per_page', 50)));
        $page = $query->paginate($per);

        return ApiResponse::success($page->items(), [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'total' => $page->total(),
        ]);
    }

    /* =================== Detail / lifecycle =================== */

    /**
     * `GET /api/v1/mobile-ops/missions/{mission}`
     *
     * Returns a single mission with checklist + photos. Enforces assignment
     * for AGENT_LIVRAISON (404 — never 403, to avoid leaking the mission's
     * existence).
     */
    public function show(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedOrManager($request, $mission);
        $mission->load(['checklistItems', 'photos']);

        return ApiResponse::success($mission);
    }

    /**
     * `POST /api/v1/mobile-ops/missions/{mission}/start`
     */
    public function start(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        $previousStatus = (string) $mission->status;
        $mission->status = 'in_progress';
        $mission->actual_start_at = now();
        $mission->save();

        AuditLogger::statusChanged(
            $mission,
            $previousStatus,
            'in_progress',
            $request->user(),
            $request,
            'mobile_ops',
            false,
            'Mission démarrée',
        );

        $this->notifyManagers($mission, 'mission_started', 'Mission démarrée', sprintf(
            'L\'agent a démarré la mission %s.',
            $mission->mission_type ?? ''
        ));

        return ApiResponse::success($mission);
    }

    /**
     * `POST /api/v1/mobile-ops/missions/{mission}/checklist`
     */
    public function addChecklistItem(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        $data = $request->validate([
            'checklist_phase' => ['required', 'string', 'max:50'],
            'item_label' => ['required', 'string', 'max:120'],
            'item_value' => ['nullable', 'string', 'max:255'],
            'item_status' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $row = MissionChecklistItem::query()->create([
            'mission_id' => $mission->id,
            'checklist_phase' => $data['checklist_phase'],
            'item_label' => $data['item_label'],
            'item_value' => $data['item_value'] ?? null,
            'item_status' => $data['item_status'] ?? 'DONE',
            'notes' => $data['notes'] ?? null,
        ]);

        AuditLogger::created($row, $request->user(), null, 'mobile_ops', $request, false, 'Check-list mission');

        return ApiResponse::success($row, null, null, 201);
    }

    /**
     * `POST /api/v1/mobile-ops/missions/{mission}/photos`
     *
     * Multipart upload. Accepts EITHER a single `file` or `file[]` array.
     * Categorises by `phase` (front, rear, left, right, interior, odometer,
     * damage, fuel, documents) — matches the Phase 3 brief.
     */
    public function uploadPhotos(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        $files = $request->file('file');
        if (! $files) {
            $files = $request->file('files');
        }
        if (! $files) {
            return ApiResponse::error('No file uploaded', 422);
        }
        if (! is_array($files)) {
            $files = [$files];
        }

        $request->validate([
            'phase' => ['nullable', 'string', 'max:50'],
            'label' => ['nullable', 'string', 'max:120'],
        ]);

        $phase = $request->input('phase');
        $label = $request->input('label');
        $disk = 'local';
        $dir = 'mission-photos/'.$mission->id;
        $created = [];

        DB::transaction(function () use ($mission, $files, $phase, $label, $disk, $dir, $request, &$created) {
            foreach ($files as $file) {
                $name = Str::uuid()->toString().'.'.($file->getClientOriginalExtension() ?: 'bin');
                $path = $file->storeAs($dir, $name, $disk);
                $row = MissionPhoto::query()->create([
                    'id' => (string) Str::uuid(),
                    'mission_id' => $mission->id,
                    'phase' => $phase,
                    'label' => $label,
                    'original_filename' => $file->getClientOriginalName(),
                    'mime_type' => $file->getClientMimeType(),
                    'size_bytes' => $file->getSize(),
                    'storage_disk' => $disk,
                    'storage_path' => $path,
                    'uploaded_by' => $request->user()?->id,
                ]);
                AuditLogger::created($row, $request->user(), null, 'mobile_ops', $request, false, 'Photo mission');
                $created[] = [
                    'photo' => $row,
                    'document_ref' => 'mph-'.$row->id,
                ];
            }
        });

        return ApiResponse::success($created, null, null, 201);
    }

    /**
     * `POST /api/v1/mobile-ops/missions/{mission}/customer-signature`
     *
     * Stores the captured client signature as a `MissionPhoto` with
     * `phase='customer_signature'`, then links its UUID into
     * `missions.customer_signature_file_id` so downstream PDF generation can
     * find it. Treated as legally significant in the audit trail.
     */
    public function customerSignature(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        $request->validate([
            'file' => ['required', 'file', 'max:5120', 'mimes:png,jpg,jpeg,svg,pdf'],
            'signed_by_name' => ['nullable', 'string', 'max:255'],
        ]);

        $file = $request->file('file');
        $disk = 'local';
        $dir = 'mission-signatures/'.$mission->id;
        $name = Str::uuid()->toString().'.'.($file->getClientOriginalExtension() ?: 'png');
        $path = $file->storeAs($dir, $name, $disk);

        $photo = DB::transaction(function () use ($mission, $file, $disk, $path, $request) {
            $photo = MissionPhoto::query()->create([
                'id' => (string) Str::uuid(),
                'mission_id' => $mission->id,
                'phase' => 'customer_signature',
                'label' => $request->input('signed_by_name'),
                'original_filename' => $file->getClientOriginalName(),
                'mime_type' => $file->getClientMimeType(),
                'size_bytes' => $file->getSize(),
                'storage_disk' => $disk,
                'storage_path' => $path,
                'uploaded_by' => $request->user()?->id,
            ]);
            $mission->customer_signature_file_id = $photo->id;
            $mission->save();

            return $photo;
        });

        AuditLogger::legalAction(
            'customer_signature_captured',
            $mission,
            $request->user(),
            null,
            [
                'signature_file_id' => $photo->id,
                'signed_by_name' => $request->input('signed_by_name'),
            ],
            $request,
            'Signature client capturée',
            'mobile_ops',
        );

        return ApiResponse::success([
            'mission_id' => $mission->id,
            'signature_file_id' => $photo->id,
            'document_ref' => 'mph-'.$photo->id,
        ], null, null, 201);
    }

    /**
     * `POST /api/v1/mobile-ops/missions/{mission}/complete`
     */
    public function complete(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        $data = $request->validate([
            'status' => ['nullable', 'string', 'in:completed,failed'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $previous = (string) $mission->status;
        $mission->status = $data['status'] ?? 'completed';
        $mission->actual_end_at = now();
        if (isset($data['notes'])) {
            $mission->notes = $data['notes'];
        }
        $mission->save();

        AuditLogger::statusChanged(
            $mission,
            $previous,
            $mission->status,
            $request->user(),
            $request,
            'mobile_ops',
            false,
            $mission->status === 'completed' ? 'Mission terminée' : 'Mission en échec',
        );

        $this->notifyManagers($mission, 'mission_completed', 'Mission terminée', sprintf(
            'Mission %s clôturée avec statut %s.',
            $mission->mission_type ?? '',
            $mission->status,
        ));

        return ApiResponse::success($mission);
    }

    /* =================== Customer-facing tracking =================== */

    /**
     * `GET /api/v1/mobile-ops/customer-tracking`
     *
     * Customer-safe view: returns ONLY the caller's own reservations with a
     * minimal status payload. No agent identity, no internal notes, no
     * checklist contents, no photo URLs — the portal user must never see
     * operational detail. Internal staff (ADMIN/DIRECTEUR) can pass
     * `?customer_id=...` to inspect a specific customer's view as part of
     * support workflows.
     */
    public function customerTracking(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = (string) ($user->role ?? '');

        if ($role === 'CLIENT_PORTAL') {
            $customerId = (string) ($user->customer_id ?? '');
            if ($customerId === '') {
                return ApiResponse::success([]);
            }
        } else {
            $customerId = (string) $request->query('customer_id', '');
            if ($customerId === '' && ! in_array($role, ['ADMIN', 'DIRECTEUR'], true)) {
                abort(403);
            }
        }

        $reservations = Reservation::query()
            ->when($customerId !== '', fn ($q) => $q->where('customer_id', $customerId))
            ->orderByDesc('updated_at')
            ->limit(50)
            ->get();

        $rows = $reservations->map(function (Reservation $r) {
            $mission = Mission::query()
                ->where('reservation_id', $r->id)
                ->orderByDesc('updated_at')
                ->first();

            return [
                'reservation_id' => $r->id,
                'reservation_status' => $r->status ?? null,
                'reservation_start' => $r->start_at ?? $r->getAttribute('start_date') ?? null,
                'reservation_end' => $r->end_at ?? $r->getAttribute('end_date') ?? null,
                // Mission summary — minimal & customer-safe.
                'mission_status' => $mission?->status,
                'mission_type' => $mission?->mission_type,
                'eta' => $mission?->scheduled_start_at,
                'started_at' => $mission?->actual_start_at,
                'completed_at' => $mission?->actual_end_at,
                'has_customer_signature' => (bool) ($mission?->customer_signature_file_id),
            ];
        })->values();

        return ApiResponse::success($rows);
    }

    /* =================== Internal helpers =================== */

    /**
     * AGENT_LIVRAISON must be the assignee. Managers (ADMIN/DIRECTEUR/
     * GESTIONNAIRE_FLOTTE) can also act on a mission (e.g. cover for a sick
     * agent). Anything else → 404 (no leaking existence).
     */
    private function ensureAssignedAgent(Request $request, Mission $mission): void
    {
        $user = $request->user();
        $role = (string) ($user->role ?? '');
        if (in_array($role, ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'], true)) {
            return;
        }
        if ($role === 'AGENT_LIVRAISON' && (string) $mission->assigned_user_id === (string) $user->id) {
            return;
        }
        abort(404);
    }

    /**
     * Read-only managers (GESTIONNAIRE_FLOTTE) can inspect any mission. For
     * AGENT_LIVRAISON the assignment check still applies. CLIENT_PORTAL must
     * never reach mission detail — they go through `customerTracking` only.
     */
    private function ensureAssignedOrManager(Request $request, Mission $mission): void
    {
        $user = $request->user();
        $role = (string) ($user->role ?? '');
        if (in_array($role, ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'], true)) {
            return;
        }
        if ($role === 'AGENT_LIVRAISON' && (string) $mission->assigned_user_id === (string) $user->id) {
            return;
        }
        abort(404);
    }

    /**
     * Best-effort manager notification: GESTIONNAIRE_FLOTTE in the same tenant.
     * Never throws — notification failures must not break mission lifecycle.
     */
    private function notifyManagers(Mission $mission, string $category, string $title, string $body): void
    {
        try {
            $this->notifications->notifyRoles(
                roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR'],
                category: $category,
                title: $title,
                body: $body,
                module: 'mobile_ops',
                priority: 'normal',
                channels: ['in_app'],
                entity: $mission,
            );
        } catch (\Throwable $e) {
            \Log::warning('mobile_ops.notify_failed', [
                'category' => $category,
                'mission' => $mission->id,
                'err' => $e->getMessage(),
            ]);
        }
    }
}
