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
            'name' => $p->name,
            'module' => $p->module,
            'description' => $p->description,
        ];
    }
}
