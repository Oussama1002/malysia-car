<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\User */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var \App\Models\User $u */
        $u = $this->resource;

        $attrs = $u->getAttributes();
        $branches = $u->relationLoaded('branches') ? $u->branches : null;
        $roles = $u->relationLoaded('roles') ? $u->roles : null;

        return [
            'id' => $u->id,
            'name' => $u->name,
            'first_name' => $attrs['first_name'] ?? null,
            'last_name' => $attrs['last_name'] ?? null,
            'email' => $u->email,
            'phone' => $attrs['phone'] ?? null,
            'role' => $u->primaryRoleCode(),
            'avatar' => $attrs['avatar_path'] ?? $attrs['avatar'] ?? null,
            'status' => $attrs['status'] ?? 'active',
            'locale' => $attrs['locale'] ?? 'fr',
            'company_id' => $attrs['company_id'] ?? null,
            'branch_id' => $attrs['branch_id'] ?? null,
            'last_login_at' => optional($u->last_login_at)->toAtomString(),
            'created_at' => optional($u->created_at)->toAtomString(),
            'updated_at' => optional($u->updated_at)->toAtomString(),
            'roles' => $roles
                ? $roles->map(fn ($r) => ['id' => $r->id, 'code' => $r->code, 'name' => $r->name])->values()->all()
                : null,
            'branches' => $branches
                ? $branches->map(fn ($b) => [
                    'id' => $b->id,
                    'code' => $b->code,
                    'name' => $b->name,
                    'is_primary' => (bool) ($b->pivot->is_primary ?? false),
                ])->values()->all()
                : null,
            'permissions' => $request->query('with_permissions') ? $u->permissionCodes() : null,
        ];
    }
}
