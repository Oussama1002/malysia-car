<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Role */
class RoleResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var \App\Models\Role $r */
        $r = $this->resource;

        $perms = $r->relationLoaded('permissions') ? $r->permissions : null;

        return [
            'id' => $r->id,
            'code' => $r->code,
            'name' => $r->name,
            'description' => $r->description,
            'company_id' => $r->company_id,
            'is_system_role' => (bool) $r->is_system_role,
            'users_count' => $this->whenCounted('users'),
            'permissions' => $perms
                ? $perms->map(fn ($p) => [
                    'id' => $p->id,
                    'code' => $p->code,
                    'name' => $p->name,
                    'module' => $p->module,
                ])->values()->all()
                : null,
            'created_at' => optional($r->created_at)->toAtomString(),
            'updated_at' => optional($r->updated_at)->toAtomString(),
        ];
    }
}
