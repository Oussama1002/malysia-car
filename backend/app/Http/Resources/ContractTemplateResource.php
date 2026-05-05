<?php

namespace App\Http\Resources;

use App\Models\ContractTemplate;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ContractTemplate */
class ContractTemplateResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var ContractTemplate $t */
        $t = $this->resource;

        return [
            'id' => $t->id,
            'code' => $t->code,
            'contractType' => $t->contract_type,
            'title' => $t->title,
            'templateHtml' => $t->template_html,
            'templateVersion' => $t->template_version,
            'isActive' => (bool) $t->is_active,
            'createdAt' => optional($t->created_at)?->toIso8601String(),
            'updatedAt' => optional($t->updated_at)?->toIso8601String(),
        ];
    }
}

