<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Users\StoreUserRequest;
use App\Http\Requests\Api\V1\Users\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Http\Responses\ApiResponse;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use App\Services\AuditLogger;
use Illuminate\Support\Str;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = User::query()->with(['roles', 'branches']);

        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('email', 'like', "%{$search}%");
                if (Schema::hasColumn('users', 'first_name')) {
                    $w->orWhere('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%");
                }
                if (Schema::hasColumn('users', 'name')) {
                    $w->orWhere('name', 'like', "%{$search}%");
                }
            });
        }
        if ($role = $request->query('role')) {
            $q->whereHas('roles', fn ($r) => $r->where('code', $role)->orWhere('roles.id', $role));
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($branchId = $request->query('branch_id')) {
            $q->whereHas('branches', fn ($b) => $b->where('branches.id', $branchId));
        }

        $per = min(100, max(1, (int) $request->query('per_page', 25)));
        $page = $q->orderBy('email')->paginate($per);

        return ApiResponse::success(
            UserResource::collection($page->items())->resolve($request),
            [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ]
        );
    }

    public function show(Request $request, User $user): JsonResponse
    {
        $user->load(['roles', 'branches']);

        return ApiResponse::success((new UserResource($user))->resolve($request));
    }

    /**
     * Garder la colonne héritée `users.role` alignée sur les rôles réellement
     * assignés. L'UI admin n'envoie que `role_ids` : sans ça la colonne retombe
     * sur sa valeur par défaut (AGENT_COMMERCIAL) et `primaryRoleCode()` — qui
     * fait confiance à la colonne avant les rôles liés — classe un MISSIONNAIRE
     * comme agent commercial, ce qui lui ouvre tous les modules (web + mobile).
     *
     * Un `role` explicitement fourni dans la requête reste prioritaire.
     *
     * @param  array<string, mixed>  $data
     */
    private function alignLegacyRoleColumn(User $user, array $data): void
    {
        if (! empty($data['role']) || ! Schema::hasColumn('users', 'role')) {
            return;
        }
        $code = $this->strongestRoleCode((array) ($data['role_ids'] ?? []));
        if ($code !== null && $code !== $user->role) {
            $user->role = $code;
            $user->save();
        }
    }

    /**
     * Code du rôle le plus fort parmi des identifiants, selon la hiérarchie
     * `erp.app_roles` (même ordre que User::primaryRoleCode()).
     *
     * @param  array<int, int|string>  $roleIds
     */
    private function strongestRoleCode(array $roleIds): ?string
    {
        if ($roleIds === []) {
            return null;
        }
        $codes = Role::query()->whereIn('id', $roleIds)->pluck('code')->filter()->values()->all();
        if ($codes === []) {
            return null;
        }
        $hierarchy = (array) config('erp.app_roles', []);
        usort($codes, function (string $a, string $b) use ($hierarchy) {
            $ra = array_search($a, $hierarchy, true);
            $rb = array_search($b, $hierarchy, true);

            return ($ra === false ? PHP_INT_MAX : $ra) <=> ($rb === false ? PHP_INT_MAX : $rb);
        });

        return (string) $codes[0];
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = DB::transaction(function () use ($data, $request) {
            $user = new User;
            $user->id = (string) Str::uuid();
            if (Schema::hasColumn('users', 'first_name')) {
                $user->first_name = $data['first_name'] ?? null;
                $user->last_name = $data['last_name'] ?? null;
            }
            if (Schema::hasColumn('users', 'name')) {
                $user->name = $data['name'] ?? trim(($data['first_name'] ?? '').' '.($data['last_name'] ?? ''));
            }
            $user->email = $data['email'];
            if (Schema::hasColumn('users', 'password_hash')) {
                $user->password_hash = Hash::make($data['password']);
            } else {
                $user->password = Hash::make($data['password']);
            }
            if (Schema::hasColumn('users', 'role')) {
                $user->role = $data['role'] ?? 'AGENT_COMMERCIAL';
            }
            if (Schema::hasColumn('users', 'phone')) {
                $user->phone = $data['phone'] ?? null;
            }
            if (Schema::hasColumn('users', 'locale')) {
                $user->locale = $data['locale'] ?? 'fr';
            }
            if (Schema::hasColumn('users', 'status')) {
                $user->status = $data['status'] ?? 'active';
            }
            if (Schema::hasColumn('users', 'company_id')) {
                $user->company_id = $data['company_id'] ?? $request->user()?->company_id;
            }
            if (Schema::hasColumn('users', 'branch_id') && ! empty($data['primary_branch_id'])) {
                $user->branch_id = $data['primary_branch_id'];
            }
            $user->save();

            if (! empty($data['role_ids']) && Schema::hasTable('user_roles')) {
                $user->roles()->sync($data['role_ids']);
                $this->alignLegacyRoleColumn($user, $data);
            }
            if (! empty($data['branch_ids']) && Schema::hasTable('user_branches')) {
                $sync = [];
                foreach ($data['branch_ids'] as $bid) {
                    $sync[$bid] = [
                        'is_primary' => ($data['primary_branch_id'] ?? null) === $bid,
                        'assigned_at' => now(),
                    ];
                }
                $user->branches()->sync($sync);
            }

            return $user->fresh(['roles', 'branches']);
        });

        AuditLogger::created($user, $request->user(), request: $request, module: 'admin', label: 'Utilisateur créé');

        return ApiResponse::success((new UserResource($user))->resolve($request), null, null, 201);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $data = $request->validated();
        $before = $user->getAttributes();
        DB::transaction(function () use ($user, $data) {
            foreach (['first_name', 'last_name', 'name', 'email', 'phone', 'role', 'locale', 'status', 'avatar'] as $k) {
                if (array_key_exists($k, $data) && Schema::hasColumn('users', $k === 'avatar' ? 'avatar' : $k)) {
                    $user->{$k} = $data[$k];
                }
            }
            if (! empty($data['password'])) {
                if (Schema::hasColumn('users', 'password_hash')) {
                    $user->password_hash = Hash::make($data['password']);
                } else {
                    $user->password = Hash::make($data['password']);
                }
            }
            if (array_key_exists('primary_branch_id', $data) && Schema::hasColumn('users', 'branch_id')) {
                $user->branch_id = $data['primary_branch_id'];
            }
            $user->save();

            if (isset($data['role_ids']) && Schema::hasTable('user_roles')) {
                $user->roles()->sync($data['role_ids']);
                $this->alignLegacyRoleColumn($user, $data);
            }
            if (isset($data['branch_ids']) && Schema::hasTable('user_branches')) {
                $sync = [];
                foreach ($data['branch_ids'] as $bid) {
                    $sync[$bid] = [
                        'is_primary' => ($data['primary_branch_id'] ?? null) === $bid,
                        'assigned_at' => now(),
                    ];
                }
                $user->branches()->sync($sync);
            }
        });

        AuditLogger::updated($user, $request->user(), before: $before, after: $user->getChanges(), request: $request, module: 'admin', label: 'Utilisateur modifié');

        return ApiResponse::success((new UserResource($user->fresh(['roles', 'branches'])))->resolve($request));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        AuditLogger::deleted($user, $request->user(), request: $request, module: 'admin', label: 'Utilisateur supprimé');

        $user->tokens()->delete();
        $user->delete();

        return ApiResponse::message('User deleted', 200);
    }

    public function activate(Request $request, User $user): JsonResponse
    {
        if (Schema::hasColumn('users', 'status')) {
            $old = $user->status;
            $user->status = 'active';
            $user->save();
            AuditLogger::statusChanged($user, $old ?? 'inactive', 'active', $request->user(), $request, module: 'admin', label: 'Utilisateur activé');
        }

        return ApiResponse::success(['id' => $user->id, 'status' => 'active']);
    }

    public function deactivate(Request $request, User $user): JsonResponse
    {
        if (Schema::hasColumn('users', 'status')) {
            $old = $user->status;
            $user->status = 'inactive';
            $user->save();
            AuditLogger::statusChanged($user, $old ?? 'active', 'inactive', $request->user(), $request, module: 'admin', label: 'Utilisateur désactivé');
        }
        $user->tokens()->delete();

        return ApiResponse::success(['id' => $user->id, 'status' => 'inactive']);
    }

    public function assignBranches(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'branch_ids' => ['required', 'array'],
            'branch_ids.*' => ['uuid', 'exists:branches,id'],
            'primary_branch_id' => ['sometimes', 'nullable', 'uuid', 'exists:branches,id'],
        ]);

        $oldBranches = $user->branches()->pluck('branches.id')->toArray();

        $sync = [];
        foreach ($data['branch_ids'] as $bid) {
            $sync[$bid] = [
                'is_primary' => ($data['primary_branch_id'] ?? null) === $bid,
                'assigned_at' => now(),
            ];
        }
        $user->branches()->sync($sync);
        if (! empty($data['primary_branch_id']) && Schema::hasColumn('users', 'branch_id')) {
            $user->branch_id = $data['primary_branch_id'];
            $user->save();
        }

        AuditLogger::updated($user, $request->user(), before: ['branch_ids' => $oldBranches], after: ['branch_ids' => $data['branch_ids']], request: $request, module: 'admin', label: 'Agences utilisateur modifiées');

        return ApiResponse::success((new UserResource($user->fresh(['roles', 'branches'])))->resolve($request));
    }

    public function loginHistory(User $user, Request $request): JsonResponse
    {
        $rows = DB::table('login_history')
            ->where('user_id', $user->id)
            ->orderByDesc('attempted_at')
            ->limit(100)
            ->get();

        return ApiResponse::success($rows);
    }

    /**
     * Retourne les permissions effectives de l'utilisateur, le catalogue
     * complet, et le sous-ensemble fourni par ses rôles. Le front s'en sert
     * pour cocher la liste d'accès dans le drawer « Accès ».
     */
    public function permissions(User $user, Request $request): JsonResponse
    {
        $all = \App\Models\Permission::query()
            ->orderBy('module_name')
            ->orderBy('code')
            ->get(['id', 'code', 'module_name', 'action_name', 'description']);

        $roleIds = $user->roles()->pluck('roles.id');
        $fromRoles = $roleIds->isEmpty()
            ? collect()
            : \App\Models\Permission::query()
                ->whereHas('roles', fn ($q) => $q->whereIn('roles.id', $roleIds))
                ->pluck('code');

        $isAdmin = ($user->role ?? null) === 'ADMIN'
            || in_array('ADMIN', $user->roleCodes(), true);

        $effective = $isAdmin
            ? $all->pluck('code')->all()
            : $user->permissionCodes();

        $overrides = Schema::hasTable('user_permissions')
            ? $user->userPermissions()->get(['permissions.code', 'user_permissions.effect'])
            : collect();

        return ApiResponse::success([
            'available' => $all,
            'role_codes' => $fromRoles->unique()->values()->all(),
            'effective_codes' => array_values(array_unique($effective)),
            'granted_codes' => $overrides->where('pivot.effect', 'grant')->pluck('code')->all(),
            'revoked_codes' => $overrides->where('pivot.effect', 'revoke')->pluck('code')->all(),
            'is_admin' => $isAdmin,
        ]);
    }

    /**
     * Synchronise la surcouche `user_permissions` à partir de la liste des
     * codes effectifs envoyés par l'UI. Le contrôleur calcule le diff vs les
     * permissions apportées par les rôles :
     *   - codes présents dans effective_codes mais pas dans les rôles → grant
     *   - codes absents d'effective_codes mais présents dans les rôles  → revoke
     *   - sinon : aucune entrée (on retombe sur le rôle)
     * Un ADMIN est intouchable côté permissions : son accès est total par
     * construction du modèle, on refuse silencieusement.
     */
    public function syncPermissions(User $user, Request $request): JsonResponse
    {
        if (! Schema::hasTable('user_permissions')) {
            return ApiResponse::success([], ['message' => 'Table user_permissions absente — migration manquante.'], null, 409);
        }

        $isAdmin = ($user->role ?? null) === 'ADMIN'
            || in_array('ADMIN', $user->roleCodes(), true);
        if ($isAdmin) {
            return ApiResponse::success([], ['message' => 'ADMIN dispose de tous les accès — rien à synchroniser.']);
        }

        $data = $request->validate([
            'effective_codes' => 'present|array',
            'effective_codes.*' => 'string',
        ]);

        $allCodes = \App\Models\Permission::query()->pluck('id', 'code')->all();
        $target = array_values(array_unique(array_intersect($data['effective_codes'], array_keys($allCodes))));

        $roleIds = $user->roles()->pluck('roles.id');
        $fromRoles = $roleIds->isEmpty()
            ? []
            : \App\Models\Permission::query()
                ->whereHas('roles', fn ($q) => $q->whereIn('roles.id', $roleIds))
                ->pluck('code')
                ->unique()
                ->values()
                ->all();

        $grants = array_values(array_diff($target, $fromRoles));
        $revokes = array_values(array_diff($fromRoles, $target));

        $before = $user->permissionCodes();

        DB::transaction(function () use ($user, $grants, $revokes, $allCodes) {
            DB::table('user_permissions')->where('user_id', $user->id)->delete();
            $rows = [];
            $now = now();
            foreach ($grants as $code) {
                if (isset($allCodes[$code])) {
                    $rows[] = [
                        'user_id' => $user->id,
                        'permission_id' => $allCodes[$code],
                        'effect' => 'grant',
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }
            foreach ($revokes as $code) {
                if (isset($allCodes[$code])) {
                    $rows[] = [
                        'user_id' => $user->id,
                        'permission_id' => $allCodes[$code],
                        'effect' => 'revoke',
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }
            if ($rows) {
                DB::table('user_permissions')->insert($rows);
            }
        });

        $after = $user->fresh()->permissionCodes();

        AuditLogger::updated(
            $user,
            $request->user(),
            before: ['permission_codes' => $before],
            after: ['permission_codes' => $after],
            request: $request,
            module: 'admin',
            label: 'Permissions utilisateur synchronisées',
        );

        return ApiResponse::success([
            'effective_codes' => $after,
            'granted_codes' => $grants,
            'revoked_codes' => $revokes,
        ], ['message' => 'Accès mis à jour.']);
    }
}
