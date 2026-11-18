<?php

namespace App\Console\Commands;

use App\Models\Reservation;
use App\Models\SubRentalContract;
use App\Services\MissionAutomationService;
use Illuminate\Console\Command;

/**
 * Generates the automatic field missions for records that already existed
 * before the mission-automation feature was deployed. Idempotent: it never
 * duplicates missions, so it is safe to run repeatedly.
 */
class BackfillAutoMissionsCommand extends Command
{
    protected $signature = 'missions:backfill-auto';

    protected $description = 'Create auto missions for existing reservations and sub-rentals';

    public function handle(MissionAutomationService $automation): int
    {
        // Reservations not yet handed over → delivery (start) + pickup (end).
        $reservations = 0;
        Reservation::query()
            ->whereIn('status', ['reserved', 'confirmed'])
            ->chunkById(200, function ($rows) use ($automation, &$reservations): void {
                foreach ($rows as $reservation) {
                    $automation->forReservationReserved($reservation);
                    $reservations++;
                }
            });

        // Live sub-rentals → collect from supplier (start) + planned return (end).
        $subRentals = 0;
        SubRentalContract::query()
            ->whereIn('status', ['draft', 'active'])
            ->with('supplierAgency')
            ->chunkById(200, function ($rows) use ($automation, &$subRentals): void {
                foreach ($rows as $contract) {
                    $automation->forSubRentalPickup($contract);
                    $automation->forSubRentalScheduledReturn($contract);
                    $subRentals++;
                }
            });

        $this->info("Backfill terminé : {$reservations} réservation(s), {$subRentals} sous-location(s) traitées.");

        return self::SUCCESS;
    }
}
