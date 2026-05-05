<?php

namespace App\Http\Requests\Api\V1\Contracts;

use App\Http\Requests\ApiFormRequest;

class UpdateContractTemplateRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'code' => ['sometimes', 'string', 'max:50'],
            'contract_type' => ['sometimes', 'string', 'max:50'],
            'title' => ['sometimes', 'string', 'max:255'],
            'template_html' => ['sometimes', 'string'],
            'template_version' => ['sometimes', 'nullable', 'string', 'max:50'],
            'is_active' => ['sometimes', 'boolean'],
            'company_id' => ['sometimes', 'nullable', 'uuid'],
        ];
    }
}

