<?php

namespace App\Http\Requests\Api\V1\Credit;

use App\Http\Requests\ApiFormRequest;

class StoreCreditApplicationRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'customer_id' => ['required', 'uuid'],
            'vehicle_id' => ['nullable', 'uuid'],
            'application_type' => ['required', 'string', 'max:50'],
            'requested_amount' => ['required', 'numeric', 'min:0'],
            'down_payment_amount' => ['nullable', 'numeric', 'min:0'],
            'requested_duration_months' => ['required', 'integer', 'min:1', 'max:120'],

            'monthly_income' => ['nullable', 'numeric', 'min:0'],
            'monthly_debt' => ['nullable', 'numeric', 'min:0'],

            'company_id' => ['nullable', 'uuid'],
            'branch_id' => ['nullable', 'uuid'],
        ];
    }
}

