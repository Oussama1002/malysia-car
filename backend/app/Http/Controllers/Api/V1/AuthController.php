<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(LoginRequest $request): \Illuminate\Http\JsonResponse
    {
        $email = $request->string('email')->toString();
        $device = $request->input('device_name', 'spa');
        $user = User::query()->where('email', $email)->first();

        if (! $user || ! Hash::check($request->string('password')->toString(), $user->getAuthPassword())) {
            $this->logAttempt($request, $user?->id, $email, false, 'invalid_credentials');
            AuditLogger::record(
                action: 'login_failed',
                module: 'auth',
                label: 'Échec de connexion',
                request: $request,
                legal: true,
            );
            throw ValidationException::withMessages([
                'email' => ['Identifiants invalides.'],
            ]);
        }
        if (Schema::hasColumn('users', 'status') && ($user->status ?? 'active') !== 'active') {
            $this->logAttempt($request, $user->id, $email, false, 'account_'.$user->status);
            AuditLogger::record(
                action: 'login_failed',
                module: 'auth',
                label: 'Échec de connexion',
                request: $request,
                legal: true,
            );
            throw ValidationException::withMessages([
                'email' => ['Compte désactivé. Contactez un administrateur.'],
            ]);
        }

        $token = $user->createToken($device, ['*'])->plainTextToken;

        if (Schema::hasColumn('users', 'last_login_at')) {
            $user->last_login_at = now();
            $user->save();
        }
        $this->logAttempt($request, $user->id, $email, true);
        AuditLogger::record(
            action: 'login',
            user: $user,
            module: 'auth',
            label: 'Connexion utilisateur',
            request: $request,
        );

        $user->load(['roles', 'branches']);

        return ApiResponse::success([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => (new UserResource($user))->resolve($request),
            'permissions' => $user->permissionCodes(),
        ]);
    }

    public function logout(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        if ($user && $user->currentAccessToken()) {
            $user->currentAccessToken()->delete();
        }

        AuditLogger::record(
            action: 'logout',
            user: $request->user(),
            module: 'auth',
            label: 'Déconnexion',
            request: $request,
        );

        return ApiResponse::message('Logged out', 200);
    }

    public function me(Request $request): \Illuminate\Http\JsonResponse
    {
        $u = $request->user();
        $u->load(['roles', 'branches']);

        return ApiResponse::success([
            'user' => (new UserResource($u))->resolve($request),
            'permissions' => $u->permissionCodes(),
        ]);
    }

    public function updateAvatar(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $data = $request->validate([
            'avatar' => ['required', 'file', 'image', 'max:2048'],
        ]);

        $file = $data['avatar'];
        $ext = strtolower((string) ($file->getClientOriginalExtension() ?: $file->extension() ?: 'jpg'));
        $path = 'avatars/'.$user->id.'/'.Str::uuid().'.'.$ext;
        Storage::disk('public')->put($path, file_get_contents($file->getRealPath()));
        $publicUrl = Storage::disk('public')->url($path);

        if (Schema::hasColumn('users', 'avatar_path')) {
            $user->avatar_path = $publicUrl;
        } elseif (Schema::hasColumn('users', 'avatar')) {
            $user->avatar = $publicUrl;
        }
        $user->save();
        $user->load(['roles', 'branches']);

        return ApiResponse::success([
            'user' => (new UserResource($user))->resolve($request),
        ]);
    }

    private function logAttempt(Request $request, ?string $userId, string $email, bool $success, ?string $reason = null): void
    {
        if (! Schema::hasTable('login_history')) {
            return;
        }
        try {
            DB::table('login_history')->insert([
                'user_id' => $userId,
                'email' => $email,
                'success' => $success ? 1 : 0,
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 500),
                'device_name' => substr((string) $request->input('device_name', 'spa'), 0, 100),
                'failure_reason' => $reason,
                'attempted_at' => now(),
            ]);
        } catch (\Throwable $e) {
            // Don't break auth if audit fails.
        }
    }
}
