<?php

namespace App\Http\Requests\Api\V1\Contracts;

use App\Http\Requests\ApiFormRequest;

class UpdateContractRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'contract_number' => ['sometimes', 'nullable', 'string', 'max:80'],
            'contract_type' => ['sometimes', 'string', 'max:50'],
            'customer_id' => ['sometimes', 'uuid'],
            'vehicle_id' => ['sometimes', 'nullable', 'uuid'],
            'template_id' => ['sometimes', 'nullable', 'uuid'],
            'credit_application_id' => ['sometimes', 'nullable', 'uuid'],
            'status' => ['sometimes', 'string', 'max:50'],

            'start_date' => ['sometimes', 'nullable', 'date'],
            'end_date' => ['sometimes', 'nullable', 'date'],
            'duration_months' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:120'],
            'currency_code' => ['sometimes', 'nullable', 'string', 'size:3'],

            'base_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'monthly_payment' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'down_payment_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'buyout_option_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'allowed_km' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'excess_km_rate' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'deposit_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'insurance_included' => ['sometimes', 'nullable', 'boolean'],
            'maintenance_included' => ['sometimes', 'nullable', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string'],

            'company_id' => ['sometimes', 'nullable', 'uuid'],
            'branch_id' => ['sometimes', 'nullable', 'uuid'],
        ];
    }
}

