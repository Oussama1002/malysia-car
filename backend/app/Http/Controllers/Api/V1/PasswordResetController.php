<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Auth\ForgotPasswordRequest;
use App\Http\Requests\Api\V1\Auth\ResetPasswordRequest;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class PasswordResetController extends Controller
{
    public function forgot(ForgotPasswordRequest $request): JsonResponse
    {
        $email = $request->string('email')->toString();

        // Always return 200 to avoid email enumeration.
        $user = User::query()->where('email', $email)->first();
        if ($user) {
            $token = Str::random(64);
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $email],
                [
                    'email' => $email,
                    'token' => Hash::make($token),
                    'created_at' => now(),
                ]
            );
            // In production, dispatch a Mail job. For dev we return the raw token.
            if (app()->environment(['local', 'development', 'testing'])) {
                return ApiResponse::success([
                    'message' => 'Un lien de réinitialisation a été envoyé.',
                    'debug_token' => $token,
                    'debug_email' => $email,
                ]);
            }
        }

        return ApiResponse::success([
            'message' => 'Si un compte existe pour cette adresse, un email a été envoyé.',
        ]);
    }

    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $email = $request->string('email')->toString();
        $token = $request->string('token')->toString();
        $password = $request->string('password')->toString();

        $row = DB::table('password_reset_tokens')->where('email', $email)->first();
        if (! $row) {
            return ApiResponse::message('Jeton invalide ou expiré.', 422);
        }
        if (! Hash::check($token, $row->token)) {
            return ApiResponse::message('Jeton invalide ou expiré.', 422);
        }

        // 60 minute TTL
        $createdAt = $row->created_at ? strtotime((string) $row->created_at) : 0;
        if ($createdAt > 0 && time() - $createdAt > 3600) {
            return ApiResponse::message('Jeton expiré, veuillez redemander un lien.', 422);
        }

        $user = User::query()->where('email', $email)->first();
        if (! $user) {
            return ApiResponse::message('Compte introuvable.', 404);
        }

        if (Schema::hasColumn('users', 'password_hash')) {
            $user->password_hash = Hash::make($password);
        } else {
            $user->password = Hash::make($password);
        }
        $user->save();

        DB::table('password_reset_tokens')->where('email', $email)->delete();
        // Invalidate any outstanding tokens for security.
        $user->tokens()->delete();

        return ApiResponse::success(['message' => 'Mot de passe mis à jour.']);
    }
}
