<?php

namespace App\Http\Requests\Api\V1\Customers;

use Illuminate\Foundation\Http\FormRequest;

class StoreCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'customer_type' => ['required', 'in:PARTICULIER,ENTREPRISE'],
            'customer_code' => ['nullable', 'string', 'max:50'],
            'status' => ['sometimes', 'in:active,inactive,suspended'],
            'risk_level' => ['sometimes', 'in:low,normal,elevated,high'],
            'preferred_language' => ['sometimes', 'in:fr,en,ar'],
            'source_channel' => ['nullable', 'string', 'max:100'],
            'branch_id' => ['nullable', 'uuid'],
            'company_id' => ['nullable', 'uuid'],
            'assigned_to_user_id' => ['nullable', 'uuid'],

            // Individual profile
            'individual_profile' => ['required_if:customer_type,PARTICULIER', 'array'],
            'individual_profile.first_name' => ['required_if:customer_type,PARTICULIER', 'string', 'max:120'],
            'individual_profile.last_name' => ['required_if:customer_type,PARTICULIER', 'string', 'max:120'],
            'individual_profile.gender' => ['nullable', 'string', 'max:20'],
            'individual_profile.date_of_birth' => ['nullable', 'date'],
            'individual_profile.nationality' => ['nullable', 'string', 'max:100'],
            'individual_profile.national_id_number' => ['nullable', 'string', 'max:100'],
            'individual_profile.passport_number' => ['nullable', 'string', 'max:100'],
            'individual_profile.driving_license_number' => ['nullable', 'string', 'max:100'],
            'individual_profile.driving_license_expiry' => ['nullable', 'date'],
            'individual_profile.profession' => ['nullable', 'string', 'max:120'],
            'individual_profile.employer_name' => ['nullable', 'string', 'max:255'],
            'individual_profile.monthly_income' => ['nullable', 'numeric'],
            'individual_profile.marital_status' => ['nullable', 'string', 'max:50'],
            'individual_profile.place_of_birth' => ['nullable', 'string', 'max:120'],

            // Company profile
            'company_profile' => ['required_if:customer_type,ENTREPRISE', 'array'],
            'company_profile.legal_name' => ['required_if:customer_type,ENTREPRISE', 'string', 'max:255'],
            'company_profile.trade_name' => ['nullable', 'string', 'max:255'],
            'company_profile.registration_number' => ['nullable', 'string', 'max:100'],
            'company_profile.ice' => ['nullable', 'string', 'max:100'],
            'company_profile.tax_identifier' => ['nullable', 'string', 'max:100'],
            'company_profile.cnss_number' => ['nullable', 'string', 'max:100'],
            'company_profile.incorporation_date' => ['nullable', 'date'],
            'company_profile.business_activity' => ['nullable', 'string', 'max:255'],
            'company_profile.annual_turnover' => ['nullable', 'numeric'],
            'company_profile.employee_count' => ['nullable', 'integer', 'min:0'],
            'company_profile.legal_representative_name' => ['nullable', 'string', 'max:255'],
            'company_profile.legal_representative_id_number' => ['nullable', 'string', 'max:100'],

            // Optional initial contacts/addresses
            'contacts' => ['sometimes', 'array'],
            'contacts.*.contact_type' => ['required_with:contacts', 'string', 'max:50'],
            'contacts.*.value' => ['required_with:contacts', 'string', 'max:255'],
            'contacts.*.is_primary' => ['sometimes', 'boolean'],
            'addresses' => ['sometimes', 'array'],
            'addresses.*.address_type' => ['required_with:addresses', 'string', 'max:50'],
            'addresses.*.address_line_1' => ['required_with:addresses', 'string', 'max:255'],
            'addresses.*.city' => ['nullable', 'string', 'max:120'],
            'addresses.*.country_code' => ['nullable', 'string', 'size:2'],
            'addresses.*.is_primary' => ['sometimes', 'boolean'],
        ];
    }
}
