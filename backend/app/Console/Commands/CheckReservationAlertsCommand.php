<?php

namespace App\Console\Commands;

use App\Models\Reservation;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class CheckReservationAlertsCommand extends Command
{
    protected $signature = 'driveflow:check-reservation-alerts';

    protected $description = 'Alert on reservation return due soon';

    public function __construct(private readonly NotificationService $notifications)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $horizon = Carbon::now()->addHours(24);
        $rows = Reservation::query()
            ->whereIn('status', ['active', 'handed_over', 'return_scheduled'])
            ->whereNotNull('desired_end_at')
            ->where('desired_end_at', '<=', $horizon)
            ->limit(200)
            ->get();

        foreach ($rows as $r) {
            $this->notifications->notifyRoles(
                roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR', 'ADMIN'],
                category: 'rentals.return_due',
                title: 'Retour véhicule attendu',
                body: 'Réservation '.$r->reservation_number.' — retour prévu '.$r->desired_end_at,
                module: 'rentals',
                priority: 'high',
                entity: $r,
                linkUrl: '/rentals',
            );
        }

        $this->info('Reservation alerts: '.$rows->count());

        return self::SUCCESS;
    }
}
