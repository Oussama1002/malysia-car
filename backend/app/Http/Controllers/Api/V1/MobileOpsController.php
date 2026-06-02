<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\FieldMissionIssue;
use App\Models\FieldMissionSignature;
use App\Models\FieldVehicleInspection;
use App\Models\Mission;
use App\Models\MissionChecklistItem;
use App\Models\MissionPhoto;
use App\Models\Reservation;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Mobile Ops — field agent workflow.
 *
 * Role-aware surface under `/api/v1/mobile-ops/*`. Row-scoping rules:
 *   - AGENT_LIVRAISON  → own assigned missions only
 *   - GESTIONNAIRE_FLOTTE → all active missions in tenant
 *   - ADMIN / DIRECTEUR → unrestricted
 */
class MobileOpsController extends Controller
{
    private const ACTIVE_STATUSES = ['pending', 'assigned', 'accepted', 'in_progress', 'arrived'];

    public function __construct(private NotificationService $notifications)
    {
    }

    /* =================== Listing =================== */

    /**
     * GET /api/v1/mobile-ops/my-missions
     */
    public function myMissions(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = $this->userRole($user);

        $query = Mission::query()
            ->with([
                'vehicle:id,registration_number',
                'assignedAgent:id,email',
                'client:id,customer_code,customer_type',
            ])
            ->withCount(['photos', 'inspections', 'issues'])
            ->orderByDesc('updated_at');

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }
        if ($type = $request->query('mission_type')) {
            $query->where('mission_type', $type);
        }

        if ($role === 'AGENT_LIVRAISON') {
            $query->where('assigned_user_id', (string) $user->id);
        } elseif ($role === 'GESTIONNAIRE_FLOTTE') {
            if (! $request->query('include_all')) {
                $query->whereIn('status', self::ACTIVE_STATUSES);
            }
        } elseif (! in_array($role, ['ADMIN', 'DIRECTEUR'], true)) {
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

    /* =================== Detail =================== */

    /**
     * GET /api/v1/mobile-ops/missions/{mission}
     */
    public function show(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedOrManager($request, $mission);
        $mission->load([
            'checklistItems',
            'photos',
            'inspections',
            'signatures',
            'issues',
            'vehicle:id,registration_number',
            'assignedAgent:id,email',
            'client:id,customer_code,customer_type',
        ]);

        return ApiResponse::success($mission);
    }

    /* =================== Lifecycle transitions =================== */

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/accept
     *
     * assigned → accepted
     */
    public function accept(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        if (! in_array($mission->status, ['assigned', 'pending'], true)) {
            return ApiResponse::error('La mission ne peut pas être acceptée dans son état actuel.', 422);
        }

        $prev = $mission->status;
        $mission->status = 'accepted';
        $mission->accepted_at = now();
        $mission->save();

        AuditLogger::statusChanged($mission, $prev, 'accepted', $request->user(), $request, 'mobile_ops', false, 'Mission acceptée');
        $this->notifyManagers($mission, 'mission_accepted', 'Mission acceptée',
            "L'agent a accepté la mission {$mission->mission_number}.");

        return ApiResponse::success($mission);
    }

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/start
     *
     * accepted (or assigned) → in_progress
     */
    public function start(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        if (! in_array($mission->status, ['planned', 'assigned', 'accepted'], true)) {
            return ApiResponse::error('La mission ne peut pas être démarrée dans son état actuel.', 422);
        }

        $prev = $mission->status;
        $mission->status = 'in_progress';
        $mission->actual_start_at = now();
        $mission->save();

        AuditLogger::statusChanged($mission, $prev, 'in_progress', $request->user(), $request, 'mobile_ops', false, 'Mission démarrée');
        $this->notifyManagers($mission, 'mission_started', 'Mission démarrée',
            "L'agent a démarré la mission {$mission->mission_number}.");

        return ApiResponse::success($mission);
    }

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/arrive
     *
     * in_progress → arrived
     */
    public function arrive(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        if (! in_array($mission->status, ['in_progress', 'accepted'], true)) {
            return ApiResponse::error('La mission n\'est pas en cours.', 422);
        }

        $prev = $mission->status;
        $mission->status = 'arrived';
        $mission->arrived_at = now();
        $mission->save();

        AuditLogger::statusChanged($mission, $prev, 'arrived', $request->user(), $request, 'mobile_ops', false, 'Agent arrivé sur site');
        $this->notifyManagers($mission, 'mission_arrived', 'Agent arrivé',
            "L'agent est arrivé pour la mission {$mission->mission_number}.");

        return ApiResponse::success($mission);
    }

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/complete
     *
     * arrived/in_progress → completed/failed
     */
    public function complete(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        if (! in_array($mission->status, ['in_progress', 'arrived'], true)) {
            return ApiResponse::error('La mission n\'est pas en cours.', 422);
        }

        $data = $request->validate([
            'status' => ['nullable', 'string', 'in:completed,failed'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $prev = $mission->status;
        $mission->status = $data['status'] ?? 'completed';
        $mission->actual_end_at = now();
        if (isset($data['notes'])) {
            $mission->notes = $data['notes'];
        }
        $mission->save();

        $label = $mission->status === 'completed' ? 'Mission terminée' : 'Mission en échec';
        AuditLogger::statusChanged($mission, $prev, $mission->status, $request->user(), $request, 'mobile_ops', false, $label);
        $this->notifyManagers($mission, 'mission_completed', $label,
            "Mission {$mission->mission_number} clôturée ({$mission->status}).");

        return ApiResponse::success($mission);
    }

    /* =================== Inspection =================== */

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/inspection
     */
    public function submitInspection(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        $data = $request->validate([
            'inspection_type' => ['required', 'string', 'in:check_in,check_out'],
            'odometer_km' => ['nullable', 'integer', 'min:0'],
            'fuel_level' => ['nullable', 'integer', 'min:0', 'max:100'],
            'exterior_condition' => ['nullable', 'string', 'in:good,minor_damage,major_damage'],
            'interior_condition' => ['nullable', 'string', 'in:good,minor_damage,major_damage'],
            'damage_notes' => ['nullable', 'string', 'max:5000'],
            'gps_lat' => ['nullable', 'numeric'],
            'gps_lng' => ['nullable', 'numeric'],
        ]);

        $inspection = FieldVehicleInspection::create([
            'mission_id' => $mission->id,
            'vehicle_id' => $mission->vehicle_id,
            'inspection_type' => $data['inspection_type'],
            'odometer_km' => $data['odometer_km'] ?? null,
            'fuel_level' => $data['fuel_level'] ?? null,
            'exterior_condition' => $data['exterior_condition'] ?? 'good',
            'interior_condition' => $data['interior_condition'] ?? 'good',
            'damage_notes' => $data['damage_notes'] ?? null,
            'gps_lat' => $data['gps_lat'] ?? null,
            'gps_lng' => $data['gps_lng'] ?? null,
            'inspected_by' => $request->user()->id,
        ]);

        AuditLogger::created($inspection, $request->user(), null, 'mobile_ops', $request, false, 'Inspection véhicule');

        return ApiResponse::success($inspection, null, null, 201);
    }

    /* =================== Issue reporting =================== */

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/issues
     */
    public function reportIssue(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        $data = $request->validate([
            'issue_type' => ['required', 'string', 'in:vehicle_damage,customer_absent,wrong_address,mechanical,other'],
            'severity' => ['required', 'string', 'in:low,medium,high,critical'],
            'description' => ['required', 'string', 'max:5000'],
        ]);

        $issue = FieldMissionIssue::create([
            'mission_id' => $mission->id,
            'issue_type' => $data['issue_type'],
            'severity' => $data['severity'],
            'description' => $data['description'],
            'reported_by' => $request->user()->id,
        ]);

        AuditLogger::created($issue, $request->user(), null, 'mobile_ops', $request, false, 'Problème signalé');

        // Critical issues get high-priority notification
        if ($data['severity'] === 'critical') {
            $this->notifyManagers($mission, 'mission_critical_issue', 'Problème critique signalé',
                "Problème critique sur mission {$mission->mission_number}: {$data['description']}", 'high');
        }

        return ApiResponse::success($issue, null, null, 201);
    }

    /**
     * PATCH /api/v1/mobile-ops/missions/{mission}/issues/{issue}
     *
     * Manager-only: resolve an issue.
     */
    public function resolveIssue(Request $request, Mission $mission, FieldMissionIssue $issue): JsonResponse
    {
        $role = $this->userRole($request->user());
        if (! in_array($role, ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'], true)) {
            abort(404);
        }

        $data = $request->validate([
            'resolution_notes' => ['required', 'string', 'max:5000'],
        ]);

        $issue->resolved_at = now();
        $issue->resolution_notes = $data['resolution_notes'];
        $issue->save();

        AuditLogger::updated($issue, $request->user(), null, 'mobile_ops', $request, false, 'Problème résolu');

        return ApiResponse::success($issue);
    }

    /* =================== Photos =================== */

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/photos
     */
    public function uploadPhotos(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        $files = $request->file('file') ?? $request->file('files');
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
        $dir = 'mission-photos/' . $mission->id;
        $created = [];

        DB::transaction(function () use ($mission, $files, $phase, $label, $disk, $dir, $request, &$created) {
            foreach ($files as $file) {
                $name = Str::uuid()->toString() . '.' . ($file->getClientOriginalExtension() ?: 'bin');
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
                $created[] = ['photo' => $row, 'document_ref' => 'mph-' . $row->id];
            }
        });

        return ApiResponse::success($created, null, null, 201);
    }

    /* =================== Checklist =================== */

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/checklist
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

    /* =================== Signature =================== */

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/signature
     *
     * Accepts either a base64 data URL (from canvas) or a file upload.
     * Creates a proper FieldMissionSignature record with legal metadata.
     */
    public function captureSignature(Request $request, Mission $mission): JsonResponse
    {
        $this->ensureAssignedAgent($request, $mission);

        $request->validate([
            'signer_name' => ['required', 'string', 'max:255'],
            'data_url' => ['required_without:file', 'nullable', 'string'],
            'file' => ['required_without:data_url', 'nullable', 'file', 'max:5120', 'mimes:png,jpg,jpeg,svg,pdf'],
            'gps_lat' => ['nullable', 'numeric'],
            'gps_lng' => ['nullable', 'numeric'],
        ]);

        $disk = 'local';
        $dir = 'mission-signatures/' . $mission->id;

        // Handle base64 data URL from canvas
        if ($dataUrl = $request->input('data_url')) {
            // data:image/png;base64,iVBOR...
            $parts = explode(',', $dataUrl, 2);
            $decoded = base64_decode($parts[1] ?? $parts[0]);
            if (! $decoded) {
                return ApiResponse::error('Invalid signature data.', 422);
            }
            $filename = Str::uuid()->toString() . '.png';
            $path = $dir . '/' . $filename;
            Storage::disk($disk)->put($path, $decoded);
        } else {
            // File upload fallback
            $file = $request->file('file');
            $filename = Str::uuid()->toString() . '.' . ($file->getClientOriginalExtension() ?: 'png');
            $path = $file->storeAs($dir, $filename, $disk);
        }

        $signature = DB::transaction(function () use ($mission, $request, $disk, $path) {
            $sig = FieldMissionSignature::create([
                'mission_id' => $mission->id,
                'signer_name' => $request->input('signer_name'),
                'signed_at' => now(),
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'gps_lat' => $request->input('gps_lat'),
                'gps_lng' => $request->input('gps_lng'),
                'storage_disk' => $disk,
                'storage_path' => $path,
            ]);

            // Also set on mission for backward compat
            $mission->customer_signature_file_id = $sig->id;
            $mission->save();

            return $sig;
        });

        AuditLogger::legalAction(
            'customer_signature_captured',
            $mission,
            $request->user(),
            null,
            [
                'signature_id' => $signature->id,
                'signer_name' => $request->input('signer_name'),
            ],
            $request,
            'Signature client capturée',
            'mobile_ops',
        );

        return ApiResponse::success([
            'mission_id' => $mission->id,
            'signature_id' => $signature->id,
            'signer_name' => $signature->signer_name,
            'signed_at' => $signature->signed_at,
        ], null, null, 201);
    }

    /**
     * POST /api/v1/mobile-ops/missions/{mission}/customer-signature
     *
     * Legacy endpoint — delegates to captureSignature with file upload.
     */
    public function customerSignature(Request $request, Mission $mission): JsonResponse
    {
        // If called with the old file-only contract, translate to new endpoint
        if ($request->hasFile('file') && ! $request->has('signer_name')) {
            $request->merge(['signer_name' => $request->input('signed_by_name', 'Client')]);
        }

        return $this->captureSignature($request, $mission);
    }

    /* =================== Customer tracking =================== */

    /**
     * GET /api/v1/mobile-ops/customer-tracking
     */
    public function customerTracking(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = $this->userRole($user);

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

    /* =================== Helpers =================== */

    private function userRole($user): string
    {
        // Support both `role` attribute and `primaryRoleCode()` method
        if (method_exists($user, 'primaryRoleCode')) {
            return (string) $user->primaryRoleCode();
        }

        return (string) ($user->role ?? '');
    }

    private function ensureAssignedAgent(Request $request, Mission $mission): void
    {
        $user = $request->user();
        $role = $this->userRole($user);
        if (in_array($role, ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'], true)) {
            return;
        }
        if ($role === 'AGENT_LIVRAISON' && (string) $mission->assigned_user_id === (string) $user->id) {
            return;
        }
        abort(404);
    }

    private function ensureAssignedOrManager(Request $request, Mission $mission): void
    {
        $user = $request->user();
        $role = $this->userRole($user);
        if (in_array($role, ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'], true)) {
            return;
        }
        if ($role === 'AGENT_LIVRAISON' && (string) $mission->assigned_user_id === (string) $user->id) {
            return;
        }
        abort(404);
    }

    private function notifyManagers(Mission $mission, string $category, string $title, string $body, string $priority = 'normal'): void
    {
        try {
            $this->notifications->notifyRoles(
                roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR'],
                category: $category,
                title: $title,
                body: $body,
                module: 'mobile_ops',
                priority: $priority,
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
