<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Permission */
class PermissionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var \App\Models\Permission $p */
        $p = $this->resource;

        return [
            'id' => $p->id,
            'code' => $p->code,
            // Colonnes réelles : action_name (libellé) et module_name.
            'name' => $p->action_name ?? $p->code,
            'module' => $p->module_name,
            'description' => $p->description,
        ];
    }
}
