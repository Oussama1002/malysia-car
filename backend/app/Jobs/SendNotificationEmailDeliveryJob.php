<?php

namespace App\Jobs;

use App\Mail\AppNotificationMail;
use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;
use Throwable;

class SendNotificationEmailDeliveryJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public string $deliveryId) {}

    public function handle(): void
    {
        if (! config('notifications.email_enabled', true)) {
            return;
        }

        $delivery = NotificationDelivery::query()->find($this->deliveryId);
        if (! $delivery || $delivery->channel !== 'email') {
            return;
        }

        $notification = Notification::query()->with('user')->find($delivery->notification_id);
        if (! $notification) {
            return;
        }

        $user = $notification->user ?? User::query()->find($notification->user_id);
        if (! $user || ! $user->email) {
            $this->markFailed($delivery, 'User has no email address.');

            return;
        }

        $delivery->update([
            'status' => 'queued',
            'attempts' => $delivery->attempts + 1,
            'last_attempt_at' => now(),
        ]);

        try {
            $url = $this->resolveActionUrl($notification);
            Mail::mailer(config('mail.default'))->to($user->email)->send(
                new AppNotificationMail($notification->title, $notification->body, $url)
            );
            $delivery->update([
                'status' => 'sent',
                'sent_at' => now(),
                'error_message' => null,
                'failed_at' => null,
            ]);
        } catch (Throwable $e) {
            $this->markFailed($delivery, $e->getMessage());
            throw $e;
        }
    }

    public function failed(?Throwable $e): void
    {
        $delivery = NotificationDelivery::query()->find($this->deliveryId);
        if ($delivery) {
            $this->markFailed($delivery, $e?->getMessage() ?? 'Job failed');
        }
    }

    private function markFailed(NotificationDelivery $delivery, string $message): void
    {
        $delivery->update([
            'status' => 'failed',
            'failed_at' => now(),
            'error_message' => $message,
        ]);
    }

    private function resolveActionUrl(Notification $notification): ?string
    {
        if ($notification->link_url) {
            $frontend = rtrim((string) env('FRONTEND_URL', ''), '/');
            $path = ltrim((string) $notification->link_url, '/');

            return $frontend !== '' ? $frontend.'/'.$path : $notification->link_url;
        }

        return null;
    }
}
