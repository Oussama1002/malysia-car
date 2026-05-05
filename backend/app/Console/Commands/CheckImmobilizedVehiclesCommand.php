<?php

namespace App\Console\Commands;

use App\Models\Vehicle;
use App\Models\VehicleRepair;
use App\Services\MaintenanceAlertService;
use App\Services\NotificationService;
use Illuminate\Console\Command;

class CheckImmobilizedVehiclesCommand extends Command
{
    protected $signature = 'driveflow:check-immobilized-vehicles';
    protected $description = 'Check long immobilized vehicles and overdue repairs';

    public function __construct(
        private readonly NotificationService $notifications,
        private readonly MaintenanceAlertService $alerts,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $count = 0;
        $vehicles = Vehicle::query()
            ->whereIn('status', ['MAINTENANCE', 'under_maintenance'])
            ->with(['repairs' => fn ($q) => $q->where('status', 'in_progress')->latest('started_at')])
            ->get();

        foreach ($vehicles as $vehicle) {
            $repair = $vehicle->repairs->first();
            if (!$repair || !$repair->started_at) continue;
            $days = $repair->started_at->diffInDays(now());
            if ($days < 7) continue;

            $type = $days >= 14 ? 'vehicle_immobilized_critical' : 'vehicle_immobilized_long';
            $severity = $days >= 14 ? 'critical' : 'high';
            $title = $days >= 14 ? 'Vehicule immobilise trop longtemps' : 'Vehicule immobilise';
            $description = "{$vehicle->registration_number} immobilise depuis {$days} jours";

            $this->alerts->createAlert(
                vehicle: $vehicle,
                type: $type.'_'.$repair->id,
                severity: $severity,
                title: $title,
                description: $description,
                payload: ['repair_id' => $repair->id, 'downtime_days' => $days],
                repairId: (int) $repair->id,
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

        $overdueRepairs = VehicleRepair::query()
            ->with('vehicle')
            ->where('status', 'in_progress')
            ->whereNotNull('started_at')
            ->get()
            ->filter(fn (VehicleRepair $r) => $r->started_at?->diffInDays(now()) >= 10);

        foreach ($overdueRepairs as $repair) {
            if (!$repair->vehicle) continue;
            $days = $repair->started_at?->diffInDays(now()) ?? 0;
            $this->alerts->createAlert(
                vehicle: $repair->vehicle,
                type: 'repair_overdue_'.$repair->id,
                severity: 'high',
                title: 'Reparation depassant delai prevu',
                description: "{$repair->vehicle->registration_number} en cours depuis {$days} jours",
                payload: ['repair_id' => $repair->id, 'days' => $days],
                repairId: (int) $repair->id,
            );
            $count++;
        }

        $this->info("Immobilization checks complete: {$count} alert(s).");
        return self::SUCCESS;
    }
}
