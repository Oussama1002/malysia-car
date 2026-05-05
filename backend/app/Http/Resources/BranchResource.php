<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Branch */
class BranchResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var \App\Models\Branch $b */
        $b = $this->resource;

        return [
            'id' => $b->id,
            'company_id' => $b->company_id,
            'code' => $b->code,
            'name' => $b->name,
            'city' => $b->city,
            'country_code' => $b->country_code,
            'phone' => $b->phone,
            'email' => $b->email,
            'is_active' => (bool) $b->is_active,
            'users_count' => $this->whenCounted('users'),
            'created_at' => optional($b->created_at)->toAtomString(),
            'updated_at' => optional($b->updated_at)->toAtomString(),
        ];
    }
}
