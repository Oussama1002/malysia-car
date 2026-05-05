<?php

namespace App\Http\Middleware;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;

class EnsureTenantScope
{
    public function handle(Request $request, \Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $role = strtoupper((string) ($user->primaryRoleCode() ?? ''));
        $isPrivileged = in_array($role, ['ADMIN', 'DIRECTEUR'], true);

        foreach ($request->route()?->parameters() ?? [] as $value) {
            if (! $value instanceof Model) {
                continue;
            }
            $table = $value->getTable();

            if (Schema::hasColumn($table, 'company_id') && ! empty($user->company_id)) {
                $rowCompany = $value->getAttribute('company_id');
                // Keep global/shared rows (company_id = null) visible to privileged
                // back-office flows such as branch catalog administration.
                if ($rowCompany !== null && (string) $rowCompany !== (string) $user->company_id) {
                    abort(404);
                }
            }

            if (! $isPrivileged && Schema::hasColumn($table, 'branch_id') && ! empty($user->branch_id)) {
                $rowBranch = $value->getAttribute('branch_id');
                if ($rowBranch !== null && (string) $rowBranch !== (string) $user->branch_id) {
                    abort(404);
                }
            }

            if ($role === 'CLIENT_PORTAL' && Schema::hasColumn($table, 'customer_id')) {
                if (! Schema::hasColumn('users', 'customer_id') || empty($user->customer_id)) {
                    abort(403);
                }
                if ((string) $value->getAttribute('customer_id') !== (string) $user->customer_id) {
                    abort(404);
                }
            }
        }

        return $next($request);
    }
}

