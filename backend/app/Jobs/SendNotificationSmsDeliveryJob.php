<?php

namespace App\Jobs;

use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\Sms\SmsProviderInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class SendNotificationSmsDeliveryJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public string $deliveryId) {}

    public function handle(SmsProviderInterface $sms): void
    {
        if (! config('notifications.sms_enabled', false)) {
            return;
        }

        $delivery = NotificationDelivery::query()->find($this->deliveryId);
        if (! $delivery || $delivery->channel !== 'sms') {
            return;
        }

        $notification = Notification::query()->with('user')->find($delivery->notification_id);
        if (! $notification) {
            return;
        }

        $user = $notification->user ?? User::query()->find($notification->user_id);
        $phone = $user ? $this->userPhone($user) : null;
        if (! $phone) {
            $this->markFailed($delivery, 'User has no mobile phone number.');

            return;
        }

        $delivery->update([
            'status' => 'queued',
            'attempts' => $delivery->attempts + 1,
            'last_attempt_at' => now(),
        ]);

        $text = trim($notification->title."\n".(string) $notification->body);
        if (strlen($text) > 480) {
            $text = substr($text, 0, 477).'...';
        }

        try {
            $result = $sms->send($phone, $text);
            if (! ($result['success'] ?? false)) {
                $this->markFailed($delivery, (string) ($result['error'] ?? 'SMS provider returned failure'));

                return;
            }
            $delivery->update([
                'status' => 'sent',
                'sent_at' => now(),
                'provider_message_id' => $result['provider_message_id'] ?? null,
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

    private function userPhone(User $user): ?string
    {
        $raw = trim((string) ($user->phone ?? $user->getAttribute('mobile') ?? ''));
        if ($raw === '') {
            return null;
        }
        if (str_starts_with($raw, '+')) {
            return strlen($raw) >= 10 ? $raw : null;
        }
        $digits = preg_replace('/\D+/', '', $raw);
        if ($digits === null || strlen($digits) < 8) {
            return null;
        }

        return '+'.$digits;
    }
}
