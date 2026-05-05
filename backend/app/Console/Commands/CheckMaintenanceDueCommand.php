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

    public function handle(): int
    {
        $count = 0;
        $plans = VehicleMaintenancePlan::query()->with('vehicle')->where('is_active', true)->get();
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
                $title = $newStatus === 'overdue' ? 'Entretien depasse' : 'Entretien bientot du';
                $description = ($plan->maintenance_type ?? 'Maintenance').' pour '.$vehicle->registration_number;
                $this->alerts->createAlert(
                    vehicle: $vehicle,
                    type: $type,
                    severity: $severity,
                    title: $title,
                    description: $description,
                    payload: ['plan_id' => $plan->id],
                    planId: (int) $plan->id,
                );
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

        $this->info("Maintenance checks complete: {$count} alert(s).");
        return self::SUCCESS;
    }
}
