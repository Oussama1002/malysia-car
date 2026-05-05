<?php

namespace App\Http\Requests\Api\V1\Customers;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'customer_type' => ['sometimes', 'in:PARTICULIER,ENTREPRISE'],
            'customer_code' => ['sometimes', 'string', 'max:50'],
            'status' => ['sometimes', 'in:active,inactive,suspended'],
            'risk_level' => ['sometimes', 'in:low,normal,elevated,high'],
            'preferred_language' => ['sometimes', 'in:fr,en,ar'],
            'source_channel' => ['nullable', 'string', 'max:100'],
            'branch_id' => ['nullable', 'uuid'],
            'assigned_to_user_id' => ['nullable', 'uuid'],

            'individual_profile' => ['sometimes', 'array'],
            'individual_profile.first_name' => ['sometimes', 'string', 'max:120'],
            'individual_profile.last_name' => ['sometimes', 'string', 'max:120'],
            'individual_profile.*' => ['sometimes'],

            'company_profile' => ['sometimes', 'array'],
            'company_profile.legal_name' => ['sometimes', 'string', 'max:255'],
            'company_profile.*' => ['sometimes'],
        ];
    }
}
