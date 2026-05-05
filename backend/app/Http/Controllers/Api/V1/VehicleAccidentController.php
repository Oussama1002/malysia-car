<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleAccident;
use App\Services\AccidentService;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VehicleAccidentController extends Controller
{
    public function __construct(
        private AccidentService $svc,
        private readonly NotificationService $notifications,
    ) {}

    /** GET /vehicles/{vehicle}/accidents */
    public function index(Vehicle $vehicle): JsonResponse
    {
        $accidents = VehicleAccident::query()
            ->with(['documents', 'driver'])
            ->where('vehicle_id', $vehicle->id)
            ->orderByDesc('accident_date')
            ->get()
            ->map(fn (VehicleAccident $a) => $this->format($a));

        return ApiResponse::success($accidents);
    }

    /** POST /vehicles/{vehicle}/accidents */
    public function store(Request $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validate([
            'accident_date'           => ['required', 'date'],
            'location'                => ['nullable', 'string', 'max:255'],
            'description'             => ['nullable', 'string', 'max:2000'],
            'severity'                => ['required', 'in:minor,major,total_loss'],
            'responsible_party'       => ['nullable', 'in:client,third_party,company'],
            'driver_user_id'          => ['nullable', 'string'],
            'contract_id'             => ['nullable', 'string'],
            'police_report_number'    => ['nullable', 'string', 'max:100'],
            'insurance_claim_number'  => ['nullable', 'string', 'max:100'],
            'estimated_damage_cost'   => ['nullable', 'numeric', 'min:0'],
            'final_cost'              => ['nullable', 'numeric', 'min:0'],
        ]);

        $accident = $this->svc->declare($vehicle, $data);
        $accident->load(['documents', 'driver']);

        AuditLogger::created($accident, $request->user(), request: $request);
        $this->notifications->notifyRoles(
            roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR', 'ADMIN'],
            category: 'fleet.accident_declared',
            title: 'Accident declare',
            body: 'Un accident a ete declare pour le vehicule '.$vehicle->registration_number.'.',
            module: 'fleet',
            priority: 'high',
            entity: $accident,
            linkUrl: '/fleet/'.$vehicle->id,
        );

        return ApiResponse::success($this->format($accident), null, null, 201);
    }

    /** PUT /accidents/{accident} */
    public function update(Request $request, VehicleAccident $accident): JsonResponse
    {
        $data = $request->validate([
            'accident_date'           => ['sometimes', 'date'],
            'location'                => ['sometimes', 'nullable', 'string', 'max:255'],
            'description'             => ['sometimes', 'nullable', 'string', 'max:2000'],
            'severity'                => ['sometimes', 'in:minor,major,total_loss'],
            'responsible_party'       => ['sometimes', 'nullable', 'in:client,third_party,company'],
            'police_report_number'    => ['sometimes', 'nullable', 'string', 'max:100'],
            'insurance_claim_number'  => ['sometimes', 'nullable', 'string', 'max:100'],
            'estimated_damage_cost'   => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'final_cost'              => ['sometimes', 'nullable', 'numeric', 'min:0'],
        ]);

        $before = $accident->getOriginal();
        $accident->update($data);
        AuditLogger::updated($accident, $request->user(), before: array_intersect_key($before, $accident->getChanges()), after: $accident->getChanges(), request: $request);

        return ApiResponse::success($this->format($accident->fresh(['documents', 'driver'])));
    }

    /** POST /accidents/{accident}/transition */
    public function transition(Request $request, VehicleAccident $accident): JsonResponse
    {
        $data = $request->validate([
            'status'                 => ['required', 'in:under_review,repaired,closed'],
            'final_cost'             => ['nullable', 'numeric', 'min:0'],
            'insurance_claim_number' => ['nullable', 'string', 'max:100'],
        ]);

        $oldStatus = (string) $accident->status;
        $accident = $this->svc->transition($accident, $data['status'], $data);
        AuditLogger::statusChanged(
            subject: $accident,
            fromStatus: $oldStatus,
            toStatus: (string) $accident->status,
            user: $request->user(),
            request: $request,
        );

        return ApiResponse::success($this->format($accident->load(['documents', 'driver'])));
    }

    /** POST /accidents/{accident}/documents */
    public function uploadDocument(Request $request, VehicleAccident $accident): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:jpg,jpeg,png,pdf,webp'],
            'type' => ['required', 'in:photo,rapport,assurance,expertise,constat'],
        ]);

        $doc = $this->svc->attachDocument($accident, $request->file('file'), $request->input('type'));

        return ApiResponse::success([
            'id'           => $doc->id,
            'document_ref' => 'acd-'.$doc->id,
            'type'         => $doc->type,
            'filename'     => $doc->filename,
            'mimeType'     => $doc->mime_type,
            'sizeBytes'    => $doc->size_bytes,
        ], null, null, 201);
    }

    /** GET /vehicles/{vehicle}/history — combined timeline */
    public function history(Vehicle $vehicle): JsonResponse
    {
        $vehicle->loadMissing([
            'maintenanceEvents',
            'repairs',
            'accidents',
            'statusHistory',
            'odometerReadings',
        ]);

        $items = collect();

        foreach ($vehicle->maintenanceEvents as $e) {
            $items->push([
                'type'  => 'maintenance',
                'at'    => $e->performed_at?->toDateString() ?? $e->created_at->toDateString(),
                'title' => $e->title,
                'meta'  => $e->vendor ?? null,
                'cost'  => $e->cost_mad !== null ? (float) $e->cost_mad : null,
                'tone'  => 'info',
            ]);
        }

        foreach ($vehicle->repairs as $r) {
            $items->push([
                'type'  => 'repair',
                'at'    => $r->reported_at?->toDateString() ?? $r->created_at->toDateString(),
                'title' => $r->description,
                'meta'  => $r->vendor_name ?? $r->repair_type,
                'cost'  => $r->cost_amount !== null ? (float) $r->cost_amount : null,
                'tone'  => $r->status === 'completed' ? 'success' : 'warning',
                'status' => $r->status,
            ]);
        }

        foreach ($vehicle->accidents as $a) {
            $items->push([
                'type'     => 'accident',
                'at'       => $a->accident_date->toDateString(),
                'title'    => "Accident ({$a->severity})",
                'meta'     => $a->location,
                'cost'     => $a->final_cost !== null ? (float) $a->final_cost : null,
                'tone'     => $a->severity === 'total_loss' ? 'danger' : ($a->severity === 'major' ? 'warning' : 'info'),
                'status'   => $a->status,
            ]);
        }

        foreach ($vehicle->statusHistory as $s) {
            $items->push([
                'type'  => 'status_change',
                'at'    => $s->started_at->toDateString(),
                'title' => "Statut → {$s->status}",
                'meta'  => $s->note,
                'tone'  => 'neutral',
            ]);
        }

        $sorted = $items->sortByDesc('at')->values();

        return ApiResponse::success($sorted);
    }

    /** @return array<string, mixed> */
    private function format(VehicleAccident $a): array
    {
        return [
            'id'                    => $a->id,
            'vehicleId'             => $a->vehicle_id,
            'driverUserId'          => $a->driver_user_id,
            'driverName'            => $a->driver?->name ?? null,
            'contractId'            => $a->contract_id,
            'accidentDate'          => $a->accident_date->toDateString(),
            'location'              => $a->location,
            'description'           => $a->description,
            'severity'              => $a->severity,
            'responsibleParty'      => $a->responsible_party,
            'policeReportNumber'    => $a->police_report_number,
            'insuranceClaimNumber'  => $a->insurance_claim_number,
            'estimatedDamageCost'   => $a->estimated_damage_cost !== null ? (float) $a->estimated_damage_cost : null,
            'finalCost'             => $a->final_cost !== null ? (float) $a->final_cost : null,
            'status'                => $a->status,
            'documents'             => $a->relationLoaded('documents')
                ? $a->documents->map(fn ($d) => [
                    'id'           => $d->id,
                    'document_ref' => 'acd-'.$d->id,
                    'type'         => $d->type,
                    'filename'     => $d->filename,
                    'mimeType'     => $d->mime_type,
                ])->toArray()
                : [],
            'createdAt' => $a->created_at->toIso8601String(),
        ];
    }
}
