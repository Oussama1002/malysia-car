<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    /**
     * Usage: middleware('role:ADMIN,DIRECTEUR')
     *
     * Reads the role from the in-memory `role` attribute when present (sqlite
     * tests + any deployment that adds the legacy column) and falls back to
     * `primaryRoleCode()` which walks the `user_roles` pivot. This keeps the
     * gate working on the production MySQL schema where the `role` column is
     * intentionally absent (see `2026_05_03_231000_create_mysql_users_table_when_missing`).
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Laravel passes `role:ADMIN,DIRECTEUR` as TWO separate string parameters
        // (the `,` is the route-middleware argument separator). For backward
        // compatibility we also accept the older single-string form
        // `role:ADMIN,DIRECTEUR` arriving in `$roles[0]`.
        $allowed = [];
        foreach ($roles as $r) {
            foreach (explode(',', $r) as $piece) {
                $piece = trim($piece);
                if ($piece !== '') {
                    $allowed[] = $piece;
                }
            }
        }
        if ($allowed === []) {
            return $next($request);
        }

        $userRole = $user->role
            ?? (method_exists($user, 'primaryRoleCode') ? $user->primaryRoleCode() : null);

        if (in_array($userRole, $allowed, true)) {
            return $next($request);
        }

        return response()->json(['message' => 'Forbidden.'], 403);
    }
}
