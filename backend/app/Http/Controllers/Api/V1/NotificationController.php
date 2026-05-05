<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Notification;
use App\Models\NotificationDelivery;
use App\Services\NotificationService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __construct(
        private readonly NotificationService $notificationService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $perPage = min(100, max(1, (int) $request->query('per_page', 50)));

        $paginator = $this->scopedNotificationQuery($request)
            ->when($request->boolean('unread_only'), fn ($q) => $q->whereNull('read_at'))
            ->when($request->query('priority'), fn ($q, $priority) => $q->where('priority', $priority))
            ->when($request->query('module'), fn ($q, $module) => $q->where('module', $module))
            ->when($request->boolean('failed_delivery'), function ($q) {
                $q->whereHas('deliveries', fn ($d) => $d->where('status', 'failed'));
            })
            ->when($request->query('channel'), function ($q, $channel) {
                $q->whereHas('deliveries', fn ($d) => $d->where('channel', $channel));
            })
            ->when($request->boolean('include_deliveries'), fn ($q) => $q->with('deliveries'))
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return ApiResponse::paginated($paginator);
    }

    public function deliveriesIndex(Request $request): JsonResponse
    {
        $perPage = min(100, max(1, (int) $request->query('per_page', 50)));

        $q = NotificationDelivery::query()
            ->with(['notification'])
            ->whereHas('notification', function (Builder $n) use ($request) {
                $this->scopedNotificationQuery($request, $n);
            });

        $q->when($request->query('status'), fn ($b, $status) => $b->where('status', $status));
        $q->when($request->query('channel'), fn ($b, $ch) => $b->where('channel', $ch));

        return ApiResponse::paginated($q->orderByDesc('created_at')->paginate($perPage));
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $count = $this->scopedNotificationQuery($request)
            ->whereNull('read_at')
            ->count();

        return ApiResponse::success(['unread' => $count]);
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        $n = $this->scopedNotificationQuery($request)
            ->where('id', $id)
            ->firstOrFail();

        if ($n->read_at === null) {
            $n->read_at = now();
            $n->save();
        }

        $n->deliveries()->where('channel', 'in_app')->update(['status' => 'read']);

        return ApiResponse::success($n->load('deliveries'));
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $ids = $this->scopedNotificationQuery($request)
            ->whereNull('read_at')
            ->pluck('id');

        $count = Notification::query()->whereIn('id', $ids)->update(['read_at' => now()]);

        NotificationDelivery::query()
            ->whereIn('notification_id', $ids)
            ->where('channel', 'in_app')
            ->update(['status' => 'read']);

        return ApiResponse::success(['marked' => $count]);
    }

    public function retry(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->role ?? '', ['ADMIN', 'DIRECTEUR'], true)) {
            abort(403, 'Forbidden.');
        }

        $notification = Notification::query()->findOrFail($id);
        if (! empty($user->company_id) && $notification->company_id
            && $notification->company_id !== $user->company_id) {
            abort(403, 'Notification hors périmètre société.');
        }

        $retried = $this->notificationService->retryFailedDeliveries($notification);

        return ApiResponse::success([
            'notification_id' => $notification->id,
            'retried_deliveries' => $retried,
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $n = $this->scopedNotificationQuery($request)
            ->where('id', $id)
            ->firstOrFail();
        $n->delete();

        return ApiResponse::message('Deleted', 200);
    }

    private function scopedNotificationQuery(Request $request, ?Builder $query = null): Builder
    {
        $user = $request->user();
        $q = $query ?? Notification::query();
        $q->where('user_id', $user->id);

        if (! empty($user->company_id) && ($user->role ?? null) !== 'ADMIN') {
            $q->where(function ($q2) use ($user) {
                $q2->whereNull('company_id')->orWhere('company_id', $user->company_id);
            });
        }

        return $q;
    }

}
