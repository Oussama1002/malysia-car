<?php

namespace App\Http\Requests\Api\V1\Fleet;

use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

class StoreVehicleRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'registration' => ['required', 'string', 'max:50'],
            'vin' => ['nullable', 'string', 'max:64'],
            'brand_id' => ['nullable', 'uuid', 'exists:vehicle_brands,id'],
            'model_id' => [
                'nullable',
                'uuid',
                Rule::exists('vehicle_models', 'id')->where(function ($q): void {
                    $bid = $this->input('brand_id');
                    if ($bid !== null && $bid !== '') {
                        $q->where('brand_id', $bid);
                    }
                }),
            ],
            'year' => ['nullable', 'integer', 'min:1900', 'max:2100'],
            'color' => ['nullable', 'string', 'max:50'],
            'fuel_type' => ['nullable', 'string', 'max:50'],
            'fiscal_power' => ['nullable', 'integer', 'min:1', 'max:999'],
            'registration_card_number' => ['nullable', 'string', 'max:100'],
            'insurance_expiry' => ['nullable', 'date'],
            'tech_control_expiry' => ['nullable', 'date'],
            'vignette_expiry' => ['nullable', 'date'],
            'mileage_km' => ['nullable', 'integer', 'min:0', 'max:2000000'],
            'status' => ['nullable', 'string', 'max:50'],
            'acquisition_type' => ['nullable', 'string', 'max:50'],
            'acquisition_date' => ['nullable', 'date'],
            'purchase_price' => ['nullable', 'numeric', 'min:0'],
            'residual_value' => ['nullable', 'numeric', 'min:0'],
            'book_value' => ['nullable', 'numeric', 'min:0'],
            'daily_rental_price' => ['nullable', 'numeric', 'min:0'],
            'monthly_rental_price' => ['nullable', 'numeric', 'min:0'],
            'gps_enabled' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'branch_id' => ['nullable', 'uuid'],
            'company_id' => ['nullable', 'uuid'],
        ];
    }
}

