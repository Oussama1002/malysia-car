<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureTenantScope;
use App\Jobs\SendNotificationEmailDeliveryJob;
use App\Jobs\SendNotificationSmsDeliveryJob;
use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class NotificationDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $email, string $role, ?string $companyId = null): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'N',
            'email' => $email,
            'password' => Hash::make('password'),
            'role' => $role,
            'company_id' => $companyId,
            'phone' => '+15551234567',
        ]);
    }

    public function test_in_app_notification_and_email_job_queued(): void
    {
        Queue::fake();
        config(['notifications.email_enabled' => true]);
        config(['notifications.channels_by_priority.normal' => ['in_app', 'email']]);

        $user = $this->makeUser('n1@test.com', 'AGENT_COMMERCIAL', null);
        $svc = app(NotificationService::class);
        $svc->notifyUser(
            userId: $user->id,
            category: 'test.cat',
            title: 'Hello',
            body: 'Body',
            module: 'notifications',
            priority: 'normal',
            channels: null,
        );

        $n = Notification::query()->where('user_id', $user->id)->first();
        $this->assertNotNull($n);
        $this->assertTrue($n->deliveries()->where('channel', 'in_app')->where('status', 'sent')->exists());
        Queue::assertPushed(SendNotificationEmailDeliveryJob::class, 1);
    }

    public function test_sms_job_dispatched_when_sms_enabled(): void
    {
        Queue::fake();
        config(['notifications.sms_enabled' => true]);
        config(['notifications.email_enabled' => false]);
        config(['notifications.channels_by_priority.critical' => ['in_app', 'sms']]);

        $user = $this->makeUser('n2@test.com', 'ADMIN', null);
        $svc = app(NotificationService::class);
        $svc->notifyUser(
            userId: $user->id,
            category: 'gps.alert',
            title: 'Alerte',
            body: 'Zone',
            module: 'gps',
            priority: 'critical',
            channels: null,
        );

        Queue::assertPushed(SendNotificationSmsDeliveryJob::class, 1);
    }

    public function test_failed_delivery_can_be_retried(): void
    {
        Queue::fake();
        config(['notifications.email_enabled' => true]);
        config(['notifications.max_delivery_attempts' => 5]);

        $user = $this->makeUser('n3@test.com', 'DIRECTEUR', null);
        $n = Notification::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'company_id' => null,
            'category' => 'x',
            'title' => 'T',
            'body' => 'B',
            'priority' => 'normal',
            'module' => 'test',
            'channels' => ['email'],
        ]);
        $d = NotificationDelivery::query()->create([
            'id' => (string) Str::uuid(),
            'notification_id' => $n->id,
            'channel' => 'email',
            'status' => 'failed',
            'attempts' => 1,
            'failed_at' => now(),
            'error_message' => 'smtp down',
        ]);

        $svc = app(NotificationService::class);
        $count = $svc->retryFailedDeliveries($n);
        $this->assertSame(1, $count);
        $d->refresh();
        $this->assertSame('pending', $d->status);
        Queue::assertPushed(SendNotificationEmailDeliveryJob::class, 1);
    }

    public function test_user_only_sees_own_notifications(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class, EnsureTenantScope::class]);
        $u1 = $this->makeUser('a@test.com', 'AGENT_COMMERCIAL', null);
        $u2 = $this->makeUser('b@test.com', 'AGENT_COMMERCIAL', null);
        Notification::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $u1->id,
            'category' => 'c1',
            'title' => '1',
            'priority' => 'normal',
        ]);
        Notification::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $u2->id,
            'category' => 'c2',
            'title' => '2',
            'priority' => 'normal',
        ]);

        $res = $this->actingAs($u1, 'sanctum')->getJson('/api/v1/notifications');
        $res->assertOk();
        $this->assertCount(1, $res->json('data'));
        $this->assertSame('1', $res->json('data.0.title'));
    }

    public function test_unread_count_endpoint(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class, EnsureTenantScope::class]);
        $u = $this->makeUser('c@test.com', 'ADMIN', null);
        Notification::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $u->id,
            'category' => 'c',
            'title' => 't',
            'priority' => 'normal',
            'read_at' => null,
        ]);

        $res = $this->actingAs($u, 'sanctum')->getJson('/api/v1/notifications/unread-count');
        $res->assertOk();
        $this->assertSame(1, $res->json('data.unread'));
    }

    public function test_email_job_sends_mail_when_run(): void
    {
        Mail::fake();
        config(['notifications.email_enabled' => true]);

        $user = $this->makeUser('mail@test.com', 'AGENT_COMMERCIAL', null);
        $n = Notification::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'category' => 'c',
            'title' => 'Subject line',
            'body' => 'Hello mail',
            'priority' => 'normal',
            'module' => 'test',
        ]);
        $d = NotificationDelivery::query()->create([
            'id' => (string) Str::uuid(),
            'notification_id' => $n->id,
            'channel' => 'email',
            'status' => 'pending',
            'attempts' => 0,
        ]);

        (new SendNotificationEmailDeliveryJob($d->id))->handle();
        Mail::assertSent(\App\Mail\AppNotificationMail::class);
        $d->refresh();
        $this->assertSame('sent', $d->status);
    }
}
