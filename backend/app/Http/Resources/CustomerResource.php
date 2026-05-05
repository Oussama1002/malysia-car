<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Customer */
class CustomerResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var \App\Models\Customer $c */
        $c = $this->resource;

        $latestKyc = $this->whenLoaded('latestKycCase');
        $individual = $this->whenLoaded('individualProfile');
        $company = $this->whenLoaded('companyProfile');

        return [
            'id' => $c->id,
            'customer_code' => $c->customer_code,
            'customer_type' => $c->customer_type,
            'status' => $c->status,
            'risk_level' => $c->risk_level,
            'is_blacklisted' => (bool) $c->is_blacklisted,
            'preferred_language' => $c->preferred_language,
            'source_channel' => $c->source_channel,
            'assigned_to_user_id' => $c->assigned_to_user_id,
            'company_id' => $c->company_id,
            'branch_id' => $c->branch_id,
            'display_name' => $c->displayName(),
            'kyc_status' => optional($c->latestKycCase)->kyc_status ?? 'pending',
            'individual_profile' => $individual instanceof \App\Models\CustomerIndividualProfile ? [
                'first_name' => $individual->first_name,
                'last_name' => $individual->last_name,
                'gender' => $individual->gender,
                'date_of_birth' => optional($individual->date_of_birth)->toDateString(),
                'nationality' => $individual->nationality,
                'marital_status' => $individual->marital_status,
                'national_id_number' => $individual->national_id_number,
                'passport_number' => $individual->passport_number,
                'driving_license_number' => $individual->driving_license_number,
                'driving_license_expiry' => optional($individual->driving_license_expiry)->toDateString(),
                'profession' => $individual->profession,
                'employer_name' => $individual->employer_name,
                'monthly_income' => $individual->monthly_income,
            ] : null,
            'company_profile' => $company instanceof \App\Models\CustomerCompanyProfile ? [
                'legal_name' => $company->legal_name,
                'trade_name' => $company->trade_name,
                'registration_number' => $company->registration_number,
                'ice' => $company->ice,
                'tax_identifier' => $company->tax_identifier,
                'cnss_number' => $company->cnss_number,
                'incorporation_date' => optional($company->incorporation_date)->toDateString(),
                'business_activity' => $company->business_activity,
                'annual_turnover' => $company->annual_turnover,
                'employee_count' => $company->employee_count,
                'legal_representative_name' => $company->legal_representative_name,
                'legal_representative_id_number' => $company->legal_representative_id_number,
            ] : null,
            'addresses' => $this->whenLoaded('addresses'),
            'contacts' => $this->whenLoaded('contacts'),
            'bank_accounts' => $this->whenLoaded('bankAccounts'),
            'latest_kyc_case' => $latestKyc instanceof \App\Models\CustomerKycCase ? [
                'id' => $latestKyc->id,
                'kyc_status' => $latestKyc->kyc_status,
                'risk_score' => $latestKyc->risk_score,
                'verification_level' => $latestKyc->verification_level,
                'reviewed_at' => optional($latestKyc->reviewed_at)->toAtomString(),
                'rejection_reason' => $latestKyc->rejection_reason,
                'expires_at' => optional($latestKyc->expires_at)->toAtomString(),
            ] : null,
            'created_at' => optional($c->created_at)->toAtomString(),
            'updated_at' => optional($c->updated_at)->toAtomString(),
        ];
    }
}
