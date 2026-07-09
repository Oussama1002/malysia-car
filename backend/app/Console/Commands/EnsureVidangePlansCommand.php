<?php

namespace App\Console\Commands;

use App\Models\Vehicle;
use App\Models\VehicleMaintenancePlan;
use Illuminate\Console\Command;

class EnsureVidangePlansCommand extends Command
{
    protected $signature = 'driveflow:ensure-vidange-plans';
    protected $description = 'Create OIL_CHANGE maintenance plans (10 000 km) for vehicles that lack one';

    private const INTERVAL_KM = 10_000;

    public function handle(): int
    {
        $created = 0;

        Vehicle::query()
            ->whereNotIn('status', ['sold', 'scrapped'])
            ->whereDoesntHave('maintenancePlans', fn ($q) => $q->where('maintenance_type', 'OIL_CHANGE'))
            ->each(function (Vehicle $vehicle) use (&$created) {
                $currentKm = (int) ($vehicle->mileage_current ?? 0);
                $lastDoneKm = (int) (floor($currentKm / self::INTERVAL_KM) * self::INTERVAL_KM);

                VehicleMaintenancePlan::create([
                    'vehicle_id' => $vehicle->id,
                    'maintenance_type' => 'OIL_CHANGE',
                    'interval_km' => self::INTERVAL_KM,
                    'next_due_km' => $lastDoneKm + self::INTERVAL_KM,
                    'is_active' => true,
                    'notes' => 'Vidange auto-créée — intervalle 10 000 km',
                ]);
                $created++;
            });

        $this->info("Vidange plans created: {$created}");
        return self::SUCCESS;
    }
}
