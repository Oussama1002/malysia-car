<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\Reservation;
use App\Services\NotificationService;
use Illuminate\Console\Command;

/**
 * Remind managers to confirm reservations that are still "Non validée" (draft)
 * and whose start date is approaching. The notification carries a ready-to-send
 * WhatsApp confirmation link to the client.
 */
class CheckReservationConfirmationsCommand extends Command
{
    protected $signature = 'driveflow:check-reservation-confirmations {--hours=48 : Look-ahead window before start date}';
    protected $description = 'Notify (with a WhatsApp confirmation link) about non-validée reservations starting soon';

    public function __construct(private readonly NotificationService $notifications)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $hours = (int) $this->option('hours') ?: 48;
        $windowEnd = now()->addHours($hours);

        $reservations = Reservation::query()
            ->with(['customer.contacts', 'vehicle'])
            ->where('status', 'draft')
            ->whereNotNull('desired_start_at')
            ->where('desired_start_at', '>', now())
            ->where('desired_start_at', '<=', $windowEnd)
            ->get();

        $count = 0;
        foreach ($reservations as $reservation) {
            // De-dupe: skip if we already raised this in the last 24h (the command
            // runs hourly, notifyRoles fans out to several users).
            $recent = Notification::query()
                ->where('entity_type', $reservation->getMorphClass())
                ->where('entity_id', (string) $reservation->id)
                ->where('category', 'rentals.confirmation_due')
                ->where('created_at', '>=', now()->subDay())
                ->exists();
            if ($recent) {
                continue;
            }

            $customer = $reservation->customer;
            $customerName = $customer
                ? (method_exists($customer, 'displayName') ? $customer->displayName() : ($customer->full_name ?? 'Client'))
                : 'Client';
            $vehicle = $reservation->vehicle;
            $vehicleLabel = $vehicle
                ? trim(($vehicle->brand_name ?? '').' '.($vehicle->model_name ?? '')).' '.($vehicle->registration_number ?? '')
                : '';
            $vehicleLabel = trim($vehicleLabel);

            $start = $reservation->desired_start_at?->format('d/m/Y H:i');
            $end = $reservation->desired_end_at?->format('d/m/Y H:i');

            $phone = $this->customerPhone($reservation);
            $message = "Bonjour {$customerName}, merci de confirmer votre réservation "
                .($reservation->reservation_number ?? '')
                .($vehicleLabel ? " (véhicule {$vehicleLabel})" : '')
                .($start ? " du {$start}" : '')
                .($end ? " au {$end}" : '')
                .'. Répondez OUI pour confirmer. Merci.';
            $whatsappUrl = $this->whatsappUrl($phone, $message);

            $body = 'Réservation '.($reservation->reservation_number ?? '')
                .' de '.$customerName
                .($start ? ' débute le '.$start : '')
                .' — non validée. Confirmez avec le client.';

            $this->notifications->notifyRoles(
                roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR', 'ADMIN'],
                category: 'rentals.confirmation_due',
                title: 'Réservation à confirmer',
                body: $body,
                module: 'rentals',
                priority: 'high',
                entity: $reservation,
                linkUrl: '/reservations/'.$reservation->id,
                payload: [
                    'reservation_id' => (string) $reservation->id,
                    'reservation_number' => $reservation->reservation_number,
                    'customer_name' => $customerName,
                    'customer_phone' => $phone,
                    'starts_at' => $start,
                    'ends_at' => $end,
                    'whatsapp_url' => $whatsappUrl,
                    'whatsapp_message' => $message,
                ],
            );
            $count++;
        }

        $this->info("Reservation confirmation checks complete: {$count} reminder(s).");

        return self::SUCCESS;
    }

    private function customerPhone(Reservation $reservation): ?string
    {
        $contacts = $reservation->customer?->contacts ?? collect();
        // Prefer mobile / whatsapp, then any phone.
        foreach (['whatsapp', 'mobile', 'phone', 'gsm'] as $type) {
            $c = $contacts->first(fn ($x) => strtolower((string) $x->contact_type) === $type && ! empty($x->value));
            if ($c) {
                return (string) $c->value;
            }
        }
        $any = $contacts->first(fn ($x) => ! empty($x->value) && preg_match('/\d{6,}/', (string) $x->value));

        return $any ? (string) $any->value : null;
    }

    /** Build a wa.me link (Morocco-aware) with the confirmation text pre-filled. */
    private function whatsappUrl(?string $phone, string $text): ?string
    {
        if (! $phone) {
            return null;
        }
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if ($digits === '') {
            return null;
        }
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        } elseif (str_starts_with($digits, '0')) {
            $digits = '212'.substr($digits, 1);   // local Moroccan number
        } elseif (strlen($digits) === 9) {
            $digits = '212'.$digits;
        }

        return 'https://wa.me/'.$digits.'?text='.rawurlencode($text);
    }
}
