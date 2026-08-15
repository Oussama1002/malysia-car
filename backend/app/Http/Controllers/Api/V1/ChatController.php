<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ChatMessage;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

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
                'last_message' => $info['last']->body
                    ?: ($info['last']->attachment_file_id ? '📎 Pièce jointe' : ''),
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
            ->get();

        $files = $this->filesFor($thread->pluck('attachment_file_id')->filter()->all());
        $threadOut = $thread->map(fn (ChatMessage $m) => $this->serialize($m, $me->id, $files));

        // Mark incoming messages from this peer as read.
        ChatMessage::query()
            ->where('sender_id', $peer)
            ->where('recipient_id', $me->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return ApiResponse::success($threadOut);
    }

    /** POST /v1/chat/messages — send { recipient_id, body?, file? } (multipart). */
    public function send(Request $request): JsonResponse
    {
        $me = $request->user();
        $data = $request->validate([
            'recipient_id' => ['required', 'uuid'],
            'body' => ['nullable', 'string', 'max:5000'],
            'file' => ['nullable', 'file', 'max:15360', 'mimes:jpg,jpeg,png,webp,gif,bmp,heic,heif,pdf,doc,docx,xls,xlsx,csv,txt,zip'],
        ]);
        if (blank($data['body'] ?? null) && ! $request->hasFile('file')) {
            return ApiResponse::error('Message vide.', 422);
        }

        // Recipient must be a real, different user.
        $recipient = User::query()
            ->where('id', $data['recipient_id'])
            ->where('id', '!=', $me->id)
            ->first();
        if (! $recipient) {
            return ApiResponse::error('Destinataire introuvable.', 404);
        }

        $attachmentFileId = null;
        if ($request->hasFile('file')) {
            $attachmentFileId = $this->storeAttachment($request->file('file'), $me);
        }

        $msg = ChatMessage::query()->create([
            'company_id' => $me->company_id,
            'sender_id' => $me->id,
            'recipient_id' => $recipient->id,
            'body' => $data['body'] ?? null,
            'attachment_file_id' => $attachmentFileId,
        ]);

        $files = $this->filesFor(array_filter([$attachmentFileId]));

        return ApiResponse::success($this->serialize($msg, $me->id, $files), null, null, 201);
    }

    /* Store an uploaded chat attachment in the files table (served publicly by
     * its UUID via /api/v1/files/{id}, like vehicle photos). Returns file id. */
    private function storeAttachment(\Illuminate\Http\UploadedFile $file, User $me): string
    {
        $ext = $file->getClientOriginalExtension() ?: $file->guessExtension() ?: 'bin';
        $name = Str::uuid().'.'.$ext;
        $path = $file->storeAs('chat/attachments', $name, 'public');
        $fileId = (string) Str::uuid();
        DB::table('files')->insert([
            'id' => $fileId,
            'company_id' => $me->company_id,
            'original_name' => $file->getClientOriginalName(),
            'stored_name' => $name,
            'storage_disk' => 'public',
            'storage_path' => $path,
            'mime_type' => $file->getMimeType(),
            'extension' => $ext,
            'file_size' => $file->getSize(),
            'is_public' => 1,
            'uploaded_by' => $me->id,
            'created_at' => now(),
        ]);

        return $fileId;
    }

    /** Look up file rows by id, keyed by id. @param array<int,string> $ids */
    private function filesFor(array $ids): \Illuminate\Support\Collection
    {
        if ($ids === []) {
            return collect();
        }

        return DB::table('files')->whereIn('id', $ids)->get()->keyBy('id');
    }

    /** Serialize a message row (+ optional attachment) for the API. */
    private function serialize(ChatMessage $m, string $meId, \Illuminate\Support\Collection $files): array
    {
        $attachment = null;
        if ($m->attachment_file_id && ($f = $files->get($m->attachment_file_id))) {
            $mime = (string) ($f->mime_type ?? '');
            $attachment = [
                'name' => $f->original_name,
                'mime' => $mime,
                'is_image' => str_starts_with($mime, 'image/'),
                'url' => rtrim((string) config('app.url'), '/').'/api/v1/files/'.$m->attachment_file_id,
            ];
        }

        return [
            'id' => (string) $m->id,
            'body' => $m->body,
            'from_me' => (string) $m->sender_id === (string) $meId,
            'created_at' => $m->created_at?->toIso8601String(),
            'read_at' => $m->read_at?->toIso8601String(),
            'attachment' => $attachment,
        ];
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
