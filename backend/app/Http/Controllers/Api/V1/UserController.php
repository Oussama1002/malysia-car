<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Users\StoreUserRequest;
use App\Http\Requests\Api\V1\Users\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
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
            $q->where('role', $role);
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

        return ApiResponse::success((new UserResource($user))->resolve($request), null, null, 201);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $data = $request->validated();
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

        return ApiResponse::success((new UserResource($user->fresh(['roles', 'branches'])))->resolve($request));
    }

    public function destroy(User $user): JsonResponse
    {
        $user->tokens()->delete();
        $user->delete();

        return ApiResponse::message('User deleted', 200);
    }

    public function activate(User $user): JsonResponse
    {
        if (Schema::hasColumn('users', 'status')) {
            $user->status = 'active';
            $user->save();
        }

        return ApiResponse::success(['id' => $user->id, 'status' => 'active']);
    }

    public function deactivate(User $user): JsonResponse
    {
        if (Schema::hasColumn('users', 'status')) {
            $user->status = 'inactive';
            $user->save();
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
}
