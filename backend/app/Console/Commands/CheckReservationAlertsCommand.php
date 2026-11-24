<?php

namespace App\Console\Commands;

use App\Models\Notification;
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

        $sent = 0;
        foreach ($rows as $r) {
            // Dedupe: QA 2026-11-24 M2 found 6× duplicates per reservation in 20h
            // because this command (scheduled every ~4h) kept re-emitting without
            // a guard. One notification per reservation per due-day is enough —
            // the dashboard badge stops being noise and the mailer queue stops
            // flooding when SMTP is back.
            $dueKey = Carbon::parse($r->desired_end_at)->format('Y-m-d');
            $already = Notification::query()
                ->where('category', 'rentals.return_due')
                ->where('entity_id', $r->id)
                ->whereDate('created_at', '>=', now()->subDay()->startOfDay())
                ->whereRaw("JSON_EXTRACT(payload, '$.due_key') = ?", [$dueKey])
                ->exists();
            if ($already) {
                continue;
            }

            $this->notifications->notifyRoles(
                roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR', 'ADMIN'],
                category: 'rentals.return_due',
                title: 'Retour véhicule attendu',
                body: sprintf(
                    'Réservation %s — retour prévu %s',
                    $r->reservation_number,
                    // dd/MM/yyyy HH:mm per AGENTS §5.6 (was raw ISO Carbon toString).
                    Carbon::parse($r->desired_end_at)->format('d/m/Y H:i'),
                ),
                module: 'rentals',
                priority: 'high',
                entity: $r,
                linkUrl: '/rentals',
                payload: ['due_key' => $dueKey],
            );
            $sent++;
        }

        $this->info(sprintf('Reservation alerts: %d candidates, %d new, %d deduplicated', $rows->count(), $sent, $rows->count() - $sent));

        return self::SUCCESS;
    }
}
