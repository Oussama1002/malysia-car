<?php

namespace App\Http\Requests\Api\V1\Contracts;

use App\Http\Requests\ApiFormRequest;

class StoreContractRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'contract_number' => ['nullable', 'string', 'max:80'],
            'contract_type' => ['required', 'string', 'max:50'],
            'customer_id' => ['required', 'uuid'],
            'vehicle_id' => ['nullable', 'uuid'],
            'template_id' => ['nullable', 'uuid'],
            'credit_application_id' => ['nullable', 'uuid'],
            'status' => ['nullable', 'string', 'max:50'],

            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date'],
            'duration_months' => ['nullable', 'integer', 'min:1', 'max:120'],
            'currency_code' => ['nullable', 'string', 'size:3'],

            'base_amount' => ['nullable', 'numeric', 'min:0'],
            'monthly_payment' => ['nullable', 'numeric', 'min:0'],
            'down_payment_amount' => ['nullable', 'numeric', 'min:0'],
            'buyout_option_amount' => ['nullable', 'numeric', 'min:0'],
            'allowed_km' => ['nullable', 'numeric', 'min:0'],
            'excess_km_rate' => ['nullable', 'numeric', 'min:0'],
            'deposit_amount' => ['nullable', 'numeric', 'min:0'],
            'insurance_included' => ['nullable', 'boolean'],
            'maintenance_included' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string'],

            'company_id' => ['nullable', 'uuid'],
            'branch_id' => ['nullable', 'uuid'],
        ];
    }
}

