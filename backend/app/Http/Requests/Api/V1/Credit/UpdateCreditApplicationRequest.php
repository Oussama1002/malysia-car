<?php

namespace App\Http\Requests\Api\V1\Credit;

use App\Http\Requests\ApiFormRequest;

class UpdateCreditApplicationRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'customer_id' => ['sometimes', 'uuid'],
            'vehicle_id' => ['sometimes', 'nullable', 'uuid'],
            'application_type' => ['sometimes', 'string', 'max:50'],
            'requested_amount' => ['sometimes', 'numeric', 'min:0'],
            'down_payment_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'requested_duration_months' => ['sometimes', 'integer', 'min:1', 'max:120'],
            'monthly_income' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'monthly_debt' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'company_id' => ['sometimes', 'nullable', 'uuid'],
            'branch_id' => ['sometimes', 'nullable', 'uuid'],
            'submitted_at' => ['sometimes', 'nullable', 'date'],
        ];
    }
}

