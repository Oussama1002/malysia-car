<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePermission
{
    /**
     * Usage: middleware('permission:vehicles.update')
     *
     * Checks the DB-backed RBAC catalogue (roles ↔ permissions ↔ users).
     * ADMIN bypasses every permission. Falls back to the legacy role-map
     * defined in config('erp.permission_roles') so older permission codes
     * continue to work during the migration.
     */
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Resolve the user's effective role: prefer the legacy `role` column if
        // present (sqlite tests), otherwise walk the `user_roles` pivot. This is
        // critical on the production MySQL schema where the column does not exist.
        $userRole = $user->role
            ?? (method_exists($user, 'primaryRoleCode') ? $user->primaryRoleCode() : null);

        // ADMIN always passes (kept here so we don't depend on User model logic).
        if ($userRole === 'ADMIN') {
            return $next($request);
        }

        if (method_exists($user, 'hasPermission') && $user->hasPermission($permission)) {
            return $next($request);
        }

        // Legacy compatibility: config('erp.permission_roles') still maps each
        // permission code to a flat list of allowed roles. This is the source of
        // truth when a freshly-installed MySQL DB has no row in role_permissions.
        $map = config('erp.permission_roles', []);
        $allowed = $map[$permission] ?? null;
        if (is_array($allowed) && $userRole !== null && in_array($userRole, $allowed, true)) {
            return $next($request);
        }

        return response()->json([
            'message' => 'Forbidden.',
            'required_permission' => $permission,
        ], 403);
    }
}
