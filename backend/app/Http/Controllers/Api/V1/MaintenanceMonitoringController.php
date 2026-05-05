<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\MaintenanceAlert;
use App\Models\VehicleMaintenancePlan;
use App\Models\VehicleRepair;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class MaintenanceMonitoringController extends Controller
{
    public function alerts(): JsonResponse
    {
        $alerts = MaintenanceAlert::query()
            ->with('vehicle')
            ->where('status', 'open')
            ->latest('triggered_at')
            ->limit(200)
            ->get()
            ->map(fn (MaintenanceAlert $a) => [
                'id' => $a->id,
                'type' => $a->alert_type,
                'severity' => $a->severity,
                'title' => $a->title,
                'description' => $a->description,
                'triggeredAt' => $a->triggered_at?->toIso8601String(),
                'vehicle' => $a->vehicle ? [
                    'id' => $a->vehicle->id,
                    'registration' => $a->vehicle->registration_number,
                    'brand' => $a->vehicle->brand_id,
                    'model' => $a->vehicle->model_id,
                ] : null,
                'payload' => $a->payload ?? [],
            ])
            ->values()
            ->all();

        $criticalCount = MaintenanceAlert::query()
            ->where('status', 'open')
            ->where('severity', 'critical')
            ->count();
        // Calendar-driven: plans due in the next 30 days (schema: next_due_at date; status column may stay "ok")
        $upcomingCount = VehicleMaintenancePlan::query()
            ->where('is_active', true)
            ->whereNotNull('next_due_at')
            ->whereDate('next_due_at', '>=', now()->toDateString())
            ->whereDate('next_due_at', '<=', now()->addDays(30)->toDateString())
            ->count();
        $immobilizedCount = VehicleRepair::query()
            ->where('status', 'in_progress')
            ->whereNotNull('started_at')
            ->get()
            ->filter(fn ($r) => $r->started_at?->diffInDays(now()) >= 7)
            ->count();
        $monthlyCosts = (float) (DB::table('vehicle_maintenance_events')
            ->whereNotNull('performed_at')
            ->whereDate('performed_at', '>=', now()->startOfMonth()->toDateString())
            ->whereDate('performed_at', '<=', now()->endOfMonth()->toDateString())
            ->selectRaw('COALESCE(SUM(COALESCE(cost_mad, 0)), 0) as total_mad')
            ->value('total_mad') ?? 0);

        return ApiResponse::success([
            'criticalAlertsCount' => $criticalCount,
            'upcomingMaintenanceCount' => $upcomingCount,
            'immobilizedVehiclesCount' => $immobilizedCount,
            'monthlyMaintenanceCost' => round((float) $monthlyCosts, 2),
            'alerts' => $alerts,
        ]);
    }

    public function calendar(): JsonResponse
    {
        $plans = VehicleMaintenancePlan::query()
            ->with('vehicle')
            ->where('is_active', true)
            ->whereNotNull('next_due_at')
            ->orderBy('next_due_at')
            ->limit(500)
            ->get()
            ->map(fn (VehicleMaintenancePlan $plan) => [
                'id' => $plan->id,
                'date' => $plan->next_due_at?->toDateString(),
                'status' => $plan->status ?: $plan->computed_status,
                'type' => $plan->maintenance_type,
                'vehicleId' => $plan->vehicle_id,
                'vehicleRegistration' => $plan->vehicle?->registration_number,
            ])
            ->values()
            ->all();

        return ApiResponse::success(['items' => $plans]);
    }
}
