<?php

namespace App\Http\Requests\Api\V1\Fleet;

use App\Http\Requests\ApiFormRequest;

class StoreVehicleDocumentRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', 'string', 'max:50'],
            'number' => ['nullable', 'string', 'max:100'],
            'issued_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
            'file' => ['required', 'file', 'max:20480'], // 20MB
        ];
    }
}

