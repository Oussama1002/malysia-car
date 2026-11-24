<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Http\Responses\ApiResponse;
use App\Models\MobileLoginRequest;
use App\Models\Notification;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MobileLoginApprovalController extends Controller
{
    /** Minutes an admin has to approve a mobile login request. */
    public const EXPIRES_MINUTES = 10;

    /** Roles that require admin approval to log in on mobile. */
    public const GATED_ROLES = ['COMPTABLE', 'ASSISTANT'];

    /**
     * Create a pending login request for a gated role, notify every ADMIN,
     * and return the request handle (no token yet). Called from AuthController.
     */
    public static function createPending(User $user, Request $request): MobileLoginRequest
    {
        $pending = MobileLoginRequest::create([
            'user_id' => $user->id,
            'device_name' => substr((string) $request->input('device_name', ''), 0, 100),
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 500),
            'status' => 'pending',
            'expires_at' => now()->addMinutes(self::EXPIRES_MINUTES),
        ]);

        // Notify every ADMIN so the first one to see it can decide.
        $admins = User::query()
            ->whereHas('roles', fn ($q) => $q->where('code', 'ADMIN'))
            ->get();

        foreach ($admins as $admin) {
            Notification::create([
                'user_id' => $admin->id,
                'company_id' => $admin->company_id ?? null,
                'category' => 'mobile_login_pending',
                'priority' => 'high',
                'module' => 'auth',
                'title' => 'Demande de connexion mobile',
                'body' => sprintf(
                    '%s (%s) demande à se connecter sur mobile. Validez ou refusez avant %s.',
                    trim(($user->first_name ?? '').' '.($user->last_name ?? '')) ?: $user->email,
                    $user->email,
                    $pending->expires_at->format('H:i'),
                ),
                'link_url' => '/admin/mobile-login/'.$pending->id,
                'payload' => [
                    'mobile_login_request_id' => $pending->id,
                    'requested_user_id' => $user->id,
                    'expires_at' => $pending->expires_at->toIso8601String(),
                ],
            ]);
        }

        AuditLogger::record(
            action: 'mobile_login_requested',
            user: $user,
            module: 'auth',
            label: 'Demande de connexion mobile (COMPTABLE/ASSISTANT)',
            request: $request,
            legal: true,
        );

        return $pending;
    }

    /**
     * Admin-facing detail: used by the web approval page to display who is
     * asking, from which device, and when the window closes.
     */
    public function show(string $id, Request $request): \Illuminate\Http\JsonResponse
    {
        $this->guardAdmin($request);
        $req = MobileLoginRequest::with('user')->findOrFail($id);
        $req->markExpiredIfNeeded();

        return ApiResponse::success([
            'request' => $this->toArray($req),
        ]);
    }

    /**
     * Admin approves: flip the request to `approved`. The actual Sanctum
     * token is minted on the mobile client's next status poll (see status()).
     */
    public function approve(string $id, Request $request): \Illuminate\Http\JsonResponse
    {
        $this->guardAdmin($request);
        $admin = $request->user();

        $req = MobileLoginRequest::lockForUpdate()->findOrFail($id);
        $req->markExpiredIfNeeded();

        if (! $req->isPending()) {
            return ApiResponse::error("La demande n'est plus en attente (".$req->status.').', 409);
        }

        $req->status = 'approved';
        $req->decided_by = $admin->id;
        $req->decided_at = now();
        $req->save();

        AuditLogger::record(
            action: 'mobile_login_approved',
            user: $admin,
            entityType: 'mobile_login_request',
            entityId: $req->id,
            after: ['target_user_id' => $req->user_id],
            module: 'auth',
            legal: true,
            request: $request,
            label: 'Connexion mobile approuvée',
        );

        return ApiResponse::success(['request' => $this->toArray($req)]);
    }

    /** Admin rejects the request. Mobile client learns via its next poll. */
    public function reject(string $id, Request $request): \Illuminate\Http\JsonResponse
    {
        $this->guardAdmin($request);
        $admin = $request->user();

        $req = MobileLoginRequest::lockForUpdate()->findOrFail($id);
        $req->markExpiredIfNeeded();

        if (! $req->isPending()) {
            return ApiResponse::error("La demande n'est plus en attente (".$req->status.').', 409);
        }

        $req->status = 'rejected';
        $req->decided_by = $admin->id;
        $req->decided_at = now();
        $req->save();

        AuditLogger::record(
            action: 'mobile_login_rejected',
            user: $admin,
            entityType: 'mobile_login_request',
            entityId: $req->id,
            after: ['target_user_id' => $req->user_id],
            module: 'auth',
            legal: true,
            request: $request,
            label: 'Connexion mobile refusée',
        );

        return ApiResponse::success(['request' => $this->toArray($req)]);
    }

    /**
     * Polled by the mobile client (public — the request id is the secret).
     * On `approved`, mints the Sanctum token exactly once and returns the
     * standard login payload so the client finishes signing in.
     */
    public function status(string $id, Request $request): \Illuminate\Http\JsonResponse
    {
        $req = MobileLoginRequest::lockForUpdate()->find($id);
        if (! $req) {
            return ApiResponse::error('Demande introuvable.', 404);
        }
        $req->markExpiredIfNeeded();

        if ($req->status === 'pending') {
            return ApiResponse::success([
                'status' => 'pending',
                'expires_at' => optional($req->expires_at)->toIso8601String(),
            ]);
        }

        if ($req->status === 'rejected' || $req->status === 'expired') {
            return ApiResponse::success([
                'status' => $req->status,
            ]);
        }

        if ($req->status === 'consumed') {
            // Token already issued once. Don't re-issue.
            return ApiResponse::error('Session déjà consommée.', 410);
        }

        // Approved and not yet consumed → issue token + mark consumed.
        $user = User::findOrFail($req->user_id);
        $device = $req->device_name ?: 'android-mobile';
        $token = $user->createToken($device, ['*'])->plainTextToken;

        $req->status = 'consumed';
        $req->consumed_at = now();
        $req->save();

        if (\Illuminate\Support\Facades\Schema::hasColumn('users', 'last_login_at')) {
            $user->last_login_at = now();
            $user->save();
        }

        $user->load(['roles', 'branches']);

        return ApiResponse::success([
            'status' => 'approved',
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => (new UserResource($user))->resolve($request),
            'permissions' => $user->permissionCodes(),
        ]);
    }

    private function guardAdmin(Request $request): void
    {
        $user = $request->user();
        if (! $user || ! $user->roles->pluck('code')->contains('ADMIN')) {
            abort(403, 'Réservé aux administrateurs.');
        }
    }

    private function toArray(MobileLoginRequest $req): array
    {
        $user = $req->user;

        return [
            'id' => $req->id,
            'status' => $req->status,
            'device_name' => $req->device_name,
            'ip_address' => $req->ip_address,
            'user_agent' => $req->user_agent,
            'expires_at' => optional($req->expires_at)->toIso8601String(),
            'decided_at' => optional($req->decided_at)->toIso8601String(),
            'created_at' => optional($req->created_at)->toIso8601String(),
            'user' => $user ? [
                'id' => $user->id,
                'email' => $user->email,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'full_name' => trim(($user->first_name ?? '').' '.($user->last_name ?? '')) ?: $user->email,
                'role' => $user->roles->pluck('code')->first(),
            ] : null,
        ];
    }
}
