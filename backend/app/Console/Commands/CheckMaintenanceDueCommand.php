<?php

namespace App\Console\Commands;

use App\Models\VehicleMaintenancePlan;
use App\Services\AuditLogger;
use App\Services\MaintenanceAlertService;
use App\Services\NotificationService;
use Illuminate\Console\Command;

class CheckMaintenanceDueCommand extends Command
{
    protected $signature = 'driveflow:check-maintenance-due';
    protected $description = 'Check maintenance plans due soon/overdue';

    public function __construct(
        private readonly NotificationService $notifications,
        private readonly MaintenanceAlertService $alerts,
    ) {
        parent::__construct();
    }

    private const MAINTENANCE_TYPE_FR = [
        'OIL_CHANGE' => 'Vidange',
        'TIRES' => 'Pneus',
        'INSPECTION' => 'Inspection',
        'BRAKES' => 'Freins',
        'FILTER' => 'Filtre',
        'BATTERY' => 'Batterie',
        'TIMING_BELT' => 'Courroie de distribution',
        'TECH_CONTROL' => 'Contrôle technique',
        'OTHER' => 'Autre',
    ];

    public function handle(): int
    {
        $count = 0;
        $plans = VehicleMaintenancePlan::query()->with(['vehicle.brand', 'vehicle.model'])->where('is_active', true)->get();
        foreach ($plans as $plan) {
            $vehicle = $plan->vehicle;
            if (!$vehicle) continue;
            $newStatus = $plan->computed_status;
            $oldStatus = (string) ($plan->status ?? 'ok');
            if ($newStatus !== $oldStatus) {
                $plan->status = $newStatus;
                $plan->save();
                AuditLogger::record(
                    action: 'maintenance_plan_status_auto_changed',
                    entityType: $plan->getMorphClass(),
                    entityId: (string) $plan->id,
                    before: ['status' => $oldStatus],
                    after: ['status' => $newStatus],
                    module: 'fleet',
                    legal: false,
                    label: 'Plan maintenance statut automatique',
                );
            }

            if (in_array($newStatus, ['due_soon', 'overdue'], true)) {
                $severity = $newStatus === 'overdue' ? 'critical' : 'high';
                $type = $newStatus === 'overdue' ? 'maintenance_overdue' : 'maintenance_due_soon';
                $title = $newStatus === 'overdue' ? 'Entretien dépassé' : 'Entretien bientôt dû';
                // Prefer the stored brand/model columns; fall back to the related
                // brand/model records when those columns were never populated.
                $brandName = $vehicle->brand_name ?: ($vehicle->brand->name ?? '');
                $modelName = $vehicle->model_name ?: ($vehicle->model->name ?? '');
                $vLabel = trim($brandName.($modelName ? ' '.$modelName : ''));
                $vFull = $vLabel ? "{$vLabel} ({$vehicle->registration_number})" : $vehicle->registration_number;
                $mType = self::MAINTENANCE_TYPE_FR[$plan->maintenance_type] ?? $plan->maintenance_type ?? 'Maintenance';
                $description = "{$mType} pour {$vFull}";
                $alert = $this->alerts->createAlert(
                    vehicle: $vehicle,
                    type: $type,
                    severity: $severity,
                    title: $title,
                    description: $description,
                    payload: ['plan_id' => $plan->id, 'vehicle_brand' => $brandName, 'vehicle_model' => $modelName, 'registration_number' => $vehicle->registration_number],
                    planId: (int) $plan->id,
                );
                // Only notify when a NEW alert was created. createAlert dedupes by
                // vehicle+type+open, so an already-open alert (same issue, or a
                // duplicate plan, or a prior scheduled run) won't re-notify. This
                // stops the notification pile-up on every run.
                if ($alert->wasRecentlyCreated) {
                    $this->notifications->notifyRoles(
                        roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR', 'ADMIN'],
                        category: 'fleet.'.$type,
                        title: $title,
                        body: $description,
                        module: 'fleet',
                        priority: $severity,
                        entity: $vehicle,
                        linkUrl: '/fleet/'.$vehicle->id,
                    );
                    $count++;
                }
            }
        }

        $this->info("Maintenance checks complete: {$count} alert(s).");
        return self::SUCCESS;
    }
}
