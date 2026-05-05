<?php

namespace App\Services;

use App\Jobs\SendNotificationEmailDeliveryJob;
use App\Jobs\SendNotificationSmsDeliveryJob;
use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Models\NotificationTemplate;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class NotificationService
{
    /**
     * @param  array<int, string>|null  $channels  null = derive from priority (see config/notifications.php)
     */
    public function notifyUser(
        string $userId,
        string $category,
        string $title,
        ?string $body = null,
        ?string $module = null,
        string $priority = 'normal',
        ?array $channels = null,
        ?string $customerId = null,
        ?Model $entity = null,
        ?string $linkUrl = null,
        array $payload = [],
    ): ?Notification {
        $user = User::query()->find($userId);
        if (! $user) {
            return null;
        }

        $channels = $this->resolveChannels($priority, $channels);

        $notification = Notification::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'company_id' => $user->company_id,
            'customer_id' => $customerId,
            'entity_type' => $entity ? $entity->getMorphClass() : null,
            'entity_id' => $entity ? (string) $entity->getKey() : null,
            'category' => $category,
            'priority' => $priority,
            'module' => $module,
            'channels' => $channels,
            'title' => $title,
            'body' => $body,
            'link_url' => $linkUrl,
            'payload' => $payload,
        ]);

        $this->createDeliveriesAndDispatch($notification, $channels);

        if (in_array($priority, ['critical'], true)) {
            AuditLogger::record(
                action: 'critical_notification_created',
                user: $user,
                entityType: $notification->entity_type,
                entityId: $notification->entity_id,
                after: [
                    'notification_id' => $notification->id,
                    'category' => $category,
                    'title' => $title,
                    'channels' => $channels,
                ],
                module: 'notifications',
                legal: true,
                label: 'Notification critique',
            );
        }

        $this->auditSensitiveOutbound($notification, $channels);

        return $notification;
    }

    /**
     * @param  array<int, string>  $roleCodes
     * @param  array<int, string>|null  $channels
     */
    public function notifyRoles(
        array $roleCodes,
        string $category,
        string $title,
        ?string $body = null,
        ?string $module = null,
        string $priority = 'normal',
        ?array $channels = null,
        ?string $customerId = null,
        ?Model $entity = null,
        ?string $linkUrl = null,
        array $payload = [],
    ): void {
        $companyId = $this->companyIdFromEntity($entity);

        foreach ($this->usersForRoles($roleCodes, $companyId) as $user) {
            $this->notifyUser(
                userId: (string) $user->id,
                category: $category,
                title: $title,
                body: $body,
                module: $module,
                priority: $priority,
                channels: $channels,
                customerId: $customerId,
                entity: $entity,
                linkUrl: $linkUrl,
                payload: $payload,
            );
        }
    }

    public function notifyFromTemplate(
        string $templateCode,
        string $userId,
        array $replacements = [],
        ?Model $entity = null,
        ?string $customerId = null,
        ?string $linkUrl = null,
        array $payload = [],
    ): ?Notification {
        $template = NotificationTemplate::query()
            ->where('code', $templateCode)
            ->where('is_active', true)
            ->first();
        if (! $template) {
            return null;
        }

        $title = $this->interpolate($template->title_template, $replacements);
        $body = $template->body_template ? $this->interpolate($template->body_template, $replacements) : null;

        return $this->notifyUser(
            userId: $userId,
            category: $templateCode,
            title: $title,
            body: $body,
            module: $template->module,
            priority: $template->priority,
            channels: $template->channels ?? null,
            customerId: $customerId,
            entity: $entity,
            linkUrl: $linkUrl,
            payload: $payload,
        );
    }

    public function retryFailedDeliveries(Notification $notification): int
    {
        $max = (int) config('notifications.max_delivery_attempts', 3);
        $count = 0;
        foreach ($notification->deliveries()->where('status', 'failed')->whereIn('channel', ['email', 'sms'])->get() as $delivery) {
            if ($delivery->attempts >= $max) {
                continue;
            }
            $delivery->update([
                'status' => 'pending',
                'error_message' => null,
                'failed_at' => null,
            ]);
            $this->dispatchDeliveryJob($delivery);
            $count++;
        }

        return $count;
    }

    /**
     * @param  array<int, string>  $channels
     */
    private function createDeliveriesAndDispatch(Notification $notification, array $channels): void
    {
        $entityType = $notification->entity_type;
        $entityId = $notification->entity_id;
        $priority = $notification->priority;

        foreach (array_unique($channels) as $channel) {
            if ($channel === 'in_app') {
                NotificationDelivery::query()->create([
                    'id' => (string) Str::uuid(),
                    'notification_id' => $notification->id,
                    'channel' => 'in_app',
                    'status' => 'sent',
                    'attempts' => 1,
                    'sent_at' => now(),
                    'entity_type' => $entityType,
                    'entity_id' => $entityId,
                    'priority' => $priority,
                ]);

                continue;
            }

            if ($channel === 'email' && ! config('notifications.email_enabled', true)) {
                continue;
            }

            if ($channel === 'sms' && ! config('notifications.sms_enabled', false)) {
                continue;
            }

            $delivery = NotificationDelivery::query()->create([
                'id' => (string) Str::uuid(),
                'notification_id' => $notification->id,
                'channel' => $channel,
                'status' => 'pending',
                'attempts' => 0,
                'entity_type' => $entityType,
                'entity_id' => $entityId,
                'priority' => $priority,
            ]);

            $this->dispatchDeliveryJob($delivery);
        }
    }

    private function dispatchDeliveryJob(NotificationDelivery $delivery): void
    {
        $queue = (string) config('notifications.queue', 'default');
        if ($delivery->channel === 'email') {
            SendNotificationEmailDeliveryJob::dispatch($delivery->id)->onQueue($queue);
        }
        if ($delivery->channel === 'sms') {
            SendNotificationSmsDeliveryJob::dispatch($delivery->id)->onQueue($queue);
        }
    }

    /**
     * @param  array<int, string>|null  $channels
     * @return array<int, string>
     */
    private function resolveChannels(string $priority, ?array $channels): array
    {
        if ($channels !== null && $channels !== []) {
            return array_values(array_unique($channels));
        }

        $map = config('notifications.channels_by_priority', []);

        return array_values(array_unique((array) ($map[$priority] ?? $map['normal'] ?? ['in_app'])));
    }

    /**
     * @param  array<int, string>  $roleCodes
     * @return Collection<int, User>
     */
    private function usersForRoles(array $roleCodes, ?string $companyId): Collection
    {
        $q = User::query()->where(function ($outer) use ($roleCodes) {
            $outer->whereHas('roles', fn ($r) => $r->whereIn('code', $roleCodes));
            if (Schema::hasTable('users') && Schema::hasColumn('users', 'role')) {
                $outer->orWhereIn('role', $roleCodes);
            }
        });

        if ($companyId) {
            $q->where('company_id', $companyId);
        }

        return $q->distinct()->get();
    }

    private function companyIdFromEntity(?Model $entity): ?string
    {
        if (! $entity) {
            return null;
        }
        $cid = $entity->getAttribute('company_id');

        return $cid !== null && $cid !== '' ? (string) $cid : null;
    }

    private function interpolate(string $template, array $vars): string
    {
        $out = $template;
        foreach ($vars as $key => $value) {
            $out = str_replace('{{'.$key.'}}', (string) $value, $out);
        }

        return $out;
    }

    /**
     * @param  array<int, string>  $channels
     */
    private function auditSensitiveOutbound(Notification $notification, array $channels): void
    {
        $outbound = array_values(array_diff($channels, ['in_app']));
        if ($outbound === []) {
            return;
        }

        $module = (string) ($notification->module ?? '');
        $legalish = in_array($module, ['signatures', 'legal', 'arrears', 'gps'], true);
        $finance = in_array($module, ['finance', 'invoices', 'contracts', 'payments'], true);
        $criticalGps = $module === 'gps' && $notification->priority === 'critical';

        if (! $legalish && ! $finance && ! $criticalGps && $notification->priority !== 'critical') {
            return;
        }

        AuditLogger::legalAction(
            action: 'notification_outbound_queued',
            subject: $notification,
            user: null,
            before: null,
            after: [
                'channels' => $outbound,
                'category' => $notification->category,
            ],
            request: null,
            label: 'File d\'envoi notification',
            module: $module !== '' ? $module : 'notifications',
        );
    }
}
