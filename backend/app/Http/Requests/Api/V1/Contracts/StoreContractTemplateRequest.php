<?php

namespace App\Http\Requests\Api\V1\Contracts;

use App\Http\Requests\ApiFormRequest;

class StoreContractTemplateRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:50'],
            'contract_type' => ['required', 'string', 'max:50'],
            'title' => ['required', 'string', 'max:255'],
            'template_html' => ['required', 'string'],
            'template_version' => ['nullable', 'string', 'max:50'],
            'is_active' => ['nullable', 'boolean'],
            'company_id' => ['nullable', 'uuid'],
        ];
    }
}

