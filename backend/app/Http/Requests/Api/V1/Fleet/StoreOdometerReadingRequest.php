<?php

namespace App\Http\Requests\Api\V1\Fleet;

use App\Http\Requests\ApiFormRequest;

class StoreOdometerReadingRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'reading_km' => ['required', 'integer', 'min:0', 'max:2000000'],
            'read_at' => ['nullable', 'date'],
            'source' => ['nullable', 'string', 'max:50'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}

