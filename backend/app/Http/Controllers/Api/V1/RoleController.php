<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Roles\StoreRoleRequest;
use App\Http\Requests\Api\V1\Roles\UpdateRoleRequest;
use App\Http\Resources\RoleResource;
use App\Http\Responses\ApiResponse;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Role::query()->with('permissions')->withCount('users');
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('code', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%");
            });
        }
        $roles = $q->orderBy('code')->get();

        return ApiResponse::success(RoleResource::collection($roles)->resolve($request));
    }

    public function show(Role $role, Request $request): JsonResponse
    {
        $role->load('permissions')->loadCount('users');

        return ApiResponse::success((new RoleResource($role))->resolve($request));
    }

    public function store(StoreRoleRequest $request): JsonResponse
    {
        $data = $request->validated();
        $role = Role::create([
            'code' => $data['code'],
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'company_id' => $data['company_id'] ?? $request->user()?->company_id,
            'is_system_role' => false,
        ]);
        if (! empty($data['permission_ids'])) {
            $role->permissions()->sync($data['permission_ids']);
        }
        $role->load('permissions')->loadCount('users');

        return ApiResponse::success((new RoleResource($role))->resolve($request), null, null, 201);
    }

    public function update(UpdateRoleRequest $request, Role $role): JsonResponse
    {
        $data = $request->validated();
        $role->fill(array_intersect_key($data, array_flip(['code', 'name', 'description'])))->save();
        if (array_key_exists('permission_ids', $data)) {
            $role->permissions()->sync($data['permission_ids']);
        }
        $role->load('permissions')->loadCount('users');

        return ApiResponse::success((new RoleResource($role))->resolve($request));
    }

    public function destroy(Role $role): JsonResponse
    {
        if ($role->is_system_role) {
            return ApiResponse::message('System roles cannot be deleted', 422);
        }
        $role->permissions()->detach();
        $role->users()->detach();
        $role->delete();

        return ApiResponse::message('Role deleted', 200);
    }

    public function syncPermissions(Request $request, Role $role): JsonResponse
    {
        $data = $request->validate([
            'permission_ids' => ['required', 'array'],
            'permission_ids.*' => ['integer', 'exists:permissions,id'],
        ]);
        $role->permissions()->sync($data['permission_ids']);
        $role->load('permissions');

        return ApiResponse::success((new RoleResource($role))->resolve($request));
    }
}
