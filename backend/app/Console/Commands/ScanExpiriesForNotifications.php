<?php

namespace App\Console\Commands;

use App\Models\Contract;
use App\Models\Notification;
use App\Models\Vehicle;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;

/**
 * Generates in-app notifications for things that need attention:
 *   - Vehicle documents expiring/expired: assurance, visite technique, vignette
 *   - Contracts reaching their end date
 *
 * Idempotent: a notification is only created once per (entity, category, due
 * date) so repeated runs (e.g. a daily cron) don't spam. Schedule it daily:
 *   $schedule->command('notifications:scan-expiries')->dailyAt('07:00');
 */
class ScanExpiriesForNotifications extends Command
{
    protected $signature = 'notifications:scan-expiries {--days=30 : Look-ahead window in days}';

    protected $description = 'Create in-app notifications for expiring vehicle documents and contracts';

    /** Roles that should receive operational expiry alerts. */
    private const TARGET_ROLES = ['ADMIN', 'DIRECTEUR'];

    public function handle(NotificationService $notifications): int
    {
        $days = (int) $this->option('days');
        $today = Carbon::today();
        $horizon = $today->copy()->addDays($days);
        $created = 0;

        // ── Vehicle documents ────────────────────────────────────────────
        $docFields = [
            'insurance_expiry' => ['Assurance', 'vehicle_insurance_expiry'],
            'tech_control_expiry' => ['Visite technique', 'vehicle_technical_expiry'],
            'vignette_expiry' => ['Vignette', 'vehicle_vignette_expiry'],
        ];

        Vehicle::query()
            ->where(function ($q) use ($docFields, $horizon) {
                foreach (array_keys($docFields) as $col) {
                    $q->orWhere(fn ($w) => $w->whereNotNull($col)->whereDate($col, '<=', $horizon));
                }
            })
            ->chunkById(200, function ($vehicles) use ($docFields, $today, $notifications, &$created) {
                foreach ($vehicles as $vehicle) {
                    foreach ($docFields as $col => [$label, $category]) {
                        $date = $vehicle->{$col};
                        if (! $date) {
                            continue;
                        }
                        $due = Carbon::parse($date);
                        $dleft = $today->diffInDays($due, false);
                        $vlabel = trim(($vehicle->brand_name ?? '').' '.($vehicle->model_name ?? '')).' '
                            .($vehicle->registration_number ?? '');
                        $when = $dleft < 0
                            ? "expirée depuis ".abs($dleft)." j"
                            : ($dleft === 0 ? "expire aujourd'hui" : "expire dans {$dleft} j");
                        $title = "{$label} {$when} · ".trim($vlabel);

                        $created += $this->notifyOnce(
                            $notifications,
                            category: $category,
                            entity: $vehicle,
                            title: $title,
                            body: "Document véhicule à renouveler (échéance {$due->toDateString()}).",
                            priority: $dleft <= 7 ? 'critical' : 'high',
                            linkUrl: '/fleet/'.$vehicle->id,
                            dueKey: $due->toDateString(),
                        );
                    }
                }
            });

        // ── Contracts reaching end date ──────────────────────────────────
        Contract::query()
            ->whereNotNull('end_date')
            ->whereDate('end_date', '<=', $horizon)
            ->whereIn('status', ['active', 'approved', 'awaiting signature'])
            ->chunkById(200, function ($contracts) use ($today, $notifications, &$created) {
                foreach ($contracts as $contract) {
                    $due = Carbon::parse($contract->end_date);
                    $dleft = $today->diffInDays($due, false);
                    $when = $dleft < 0
                        ? "échu depuis ".abs($dleft)." j"
                        : ($dleft === 0 ? "expire aujourd'hui" : "expire dans {$dleft} j");
                    $ref = $contract->contract_number ?? substr($contract->id, 0, 8);
                    $title = "Contrat {$when} · {$ref}";

                    $created += $this->notifyOnce(
                        $notifications,
                        category: 'contract_expiry',
                        entity: $contract,
                        title: $title,
                        body: "Contrat arrivant à échéance ({$due->toDateString()}).",
                        priority: $dleft <= 7 ? 'critical' : 'high',
                        linkUrl: '/contracts/'.$contract->id,
                        dueKey: $due->toDateString(),
                    );
                }
            });

        $this->info("Notifications créées : {$created}");

        return self::SUCCESS;
    }

    /**
     * Notify the target roles once per (entity, category, due date). Returns 1
     * if a new notification batch was created, 0 if it already existed.
     */
    private function notifyOnce(
        NotificationService $notifications,
        string $category,
        Model $entity,
        string $title,
        string $body,
        string $priority,
        string $linkUrl,
        string $dueKey,
    ): int {
        $already = Notification::query()
            ->where('entity_type', $entity->getMorphClass())
            ->where('entity_id', (string) $entity->getKey())
            ->where('category', $category)
            ->where('title', $title)
            ->exists();

        if ($already) {
            return 0;
        }

        $notifications->notifyRoles(
            roleCodes: self::TARGET_ROLES,
            category: $category,
            title: $title,
            body: $body,
            module: 'fleet',
            priority: $priority,
            channels: ['in_app'],
            entity: $entity,
            linkUrl: $linkUrl,
            payload: ['due' => $dueKey],
        );

        return 1;
    }
}
