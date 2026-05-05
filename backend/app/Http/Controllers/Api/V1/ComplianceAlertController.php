<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ComplianceAlert;
use App\Services\ComplianceAlertService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ComplianceAlertController extends Controller
{
    public function __construct(private readonly ComplianceAlertService $service) {}

    public function index(Request $request): JsonResponse
    {
        if ($request->boolean('sync', true)) {
            $this->service->syncAll();
        }

        $rows = ComplianceAlert::query()
            ->with('vehicle')
            ->where('status', 'open')
            ->orderByDesc('severity')
            ->orderBy('due_date')
            ->limit(500)
            ->get()
            ->map(fn (ComplianceAlert $a) => [
                'id' => $a->id,
                'type' => $a->alert_type,
                'severity' => $a->severity,
                'title' => $a->title,
                'description' => $a->description,
                'dueDate' => $a->due_date?->toDateString(),
                'triggeredAt' => $a->triggered_at?->toIso8601String(),
                'payload' => $a->payload ?? [],
                'vehicle' => $a->vehicle ? [
                    'id' => $a->vehicle->id,
                    'registration' => $a->vehicle->registration_number,
                ] : null,
            ])
            ->values();

        $summary = [
            'expired' => $rows->whereIn('type', ['insurance_expired', 'technical_expired'])->count(),
            'expiringSoon' => $rows->whereIn('type', ['insurance_expiring_soon', 'technical_expiring_soon'])->count(),
            'missingDocuments' => $rows->whereIn('type', ['insurance_missing', 'technical_missing'])->count(),
        ];

        return ApiResponse::success([
            'summary' => $summary,
            'alerts' => $rows,
        ]);
    }
}
