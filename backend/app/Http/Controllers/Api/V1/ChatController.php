<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Internal 1-to-1 chat between users (polling-based). All endpoints are scoped
 * to the authenticated user's company.
 */
class ChatController extends Controller
{
    /** GET /v1/chat/users — other users you can message. Mirrors the app's
     *  canonical user list (UserController@index applies no company filter),
     *  excluding yourself. */
    public function users(Request $request): JsonResponse
    {
        $me = $request->user();
        // NB: `name` is a computed accessor, not a column — never orderBy('name').
        $users = User::query()
            ->where('id', '!=', $me->id)
            ->get()
            ->sortBy(fn (User $u) => mb_strtolower((string) $u->name))
            ->values()
            ->map(fn (User $u) => [
                'id' => (string) $u->id,
                'name' => $u->name,
                'role' => $u->role,
                'avatar' => $u->avatar ?? null,
            ]);

        return ApiResponse::success($users);
    }

    /** GET /v1/chat/conversations — one row per correspondent: last message + unread count. */
    public function conversations(Request $request): JsonResponse
    {
        $me = $request->user();

        $messages = ChatMessage::query()
            ->where(fn ($q) => $q->where('sender_id', $me->id)->orWhere('recipient_id', $me->id))
            ->orderByDesc('created_at')
            ->get();

        $byPeer = [];
        foreach ($messages as $m) {
            $peerId = (string) ($m->sender_id === $me->id ? $m->recipient_id : $m->sender_id);
            if (! isset($byPeer[$peerId])) {
                $byPeer[$peerId] = ['last' => $m, 'unread' => 0];
            }
            if ((string) $m->recipient_id === (string) $me->id && $m->read_at === null) {
                $byPeer[$peerId]['unread']++;
            }
        }

        $peerIds = array_keys($byPeer);
        $usersById = User::query()->whereIn('id', $peerIds)->get()->keyBy(fn (User $u) => (string) $u->id);

        $conversations = [];
        foreach ($byPeer as $peerId => $info) {
            $u = $usersById->get($peerId);
            $conversations[] = [
                'user_id' => $peerId,
                'name' => $u?->name ?? 'Utilisateur',
                'role' => $u?->role,
                'avatar' => $u?->avatar ?? null,
                'last_message' => $info['last']->body,
                'last_at' => $info['last']->created_at?->toIso8601String(),
                'last_from_me' => (string) $info['last']->sender_id === (string) $me->id,
                'unread' => $info['unread'],
            ];
        }
        // Sort by most recent activity.
        usort($conversations, fn ($a, $b) => strcmp($b['last_at'] ?? '', $a['last_at'] ?? ''));

        return ApiResponse::success($conversations);
    }

    /** GET /v1/chat/messages?with={userId} — thread with one user; marks it read. */
    public function messages(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $request->validate(['with' => ['required', 'uuid']]);
        $peer = $data['with'];

        $thread = ChatMessage::query()
            ->where(function ($q) use ($me, $peer) {
                $q->where(fn ($x) => $x->where('sender_id', $me->id)->where('recipient_id', $peer))
                  ->orWhere(fn ($x) => $x->where('sender_id', $peer)->where('recipient_id', $me->id));
            })
            ->orderBy('created_at')
            ->limit(500)
            ->get()
            ->map(fn (ChatMessage $m) => [
                'id' => (string) $m->id,
                'body' => $m->body,
                'from_me' => (string) $m->sender_id === (string) $me->id,
                'created_at' => $m->created_at?->toIso8601String(),
                'read_at' => $m->read_at?->toIso8601String(),
            ]);

        // Mark incoming messages from this peer as read.
        ChatMessage::query()
            ->where('sender_id', $peer)
            ->where('recipient_id', $me->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return ApiResponse::success($thread);
    }

    /** POST /v1/chat/messages — send { recipient_id, body }. */
    public function send(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $request->validate([
            'recipient_id' => ['required', 'uuid'],
            'body' => ['required', 'string', 'max:5000'],
        ]);

        // Recipient must be a real, different user.
        $recipient = User::query()
            ->where('id', $data['recipient_id'])
            ->where('id', '!=', $me->id)
            ->first();
        if (! $recipient) {
            return ApiResponse::error('Destinataire introuvable.', 404);
        }

        $msg = ChatMessage::query()->create([
            'company_id' => $me->company_id,
            'sender_id' => $me->id,
            'recipient_id' => $recipient->id,
            'body' => $data['body'],
        ]);

        return ApiResponse::success([
            'id' => (string) $msg->id,
            'body' => $msg->body,
            'from_me' => true,
            'created_at' => $msg->created_at?->toIso8601String(),
            'read_at' => null,
        ], null, null, 201);
    }

    /** GET /v1/chat/unread-count — total unread messages for the badge. */
    public function unreadCount(Request $request): JsonResponse
    {
        $me = $request->user();
        $count = ChatMessage::query()
            ->where('recipient_id', $me->id)
            ->whereNull('read_at')
            ->count();

        return ApiResponse::success(['unread' => $count]);
    }
}
