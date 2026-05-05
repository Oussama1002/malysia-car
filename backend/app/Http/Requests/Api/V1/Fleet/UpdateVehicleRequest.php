<?php

namespace App\Http\Requests\Api\V1\Fleet;

use App\Http\Requests\ApiFormRequest;
use Illuminate\Validation\Rule;

class UpdateVehicleRequest extends ApiFormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'registration' => ['sometimes', 'string', 'max:50'],
            'vin' => ['sometimes', 'nullable', 'string', 'max:64'],
            'brand_id' => ['sometimes', 'nullable', 'uuid', 'exists:vehicle_brands,id'],
            'model_id' => [
                'sometimes',
                'nullable',
                'uuid',
                Rule::exists('vehicle_models', 'id')->where(function ($q): void {
                    $bid = $this->filled('brand_id')
                        ? $this->input('brand_id')
                        : $this->route('vehicle')?->brand_id;
                    if ($bid !== null && $bid !== '') {
                        $q->where('brand_id', $bid);
                    }
                }),
            ],
            'year' => ['sometimes', 'nullable', 'integer', 'min:1900', 'max:2100'],
            'color' => ['sometimes', 'nullable', 'string', 'max:50'],
            'fuel_type' => ['sometimes', 'nullable', 'string', 'max:50'],
            'fiscal_power' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:999'],
            'registration_card_number' => ['sometimes', 'nullable', 'string', 'max:100'],
            'insurance_expiry' => ['sometimes', 'nullable', 'date'],
            'tech_control_expiry' => ['sometimes', 'nullable', 'date'],
            'vignette_expiry' => ['sometimes', 'nullable', 'date'],
            'mileage_km' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:2000000'],
            'status' => ['sometimes', 'string', 'max:50'],
            'status_note' => ['sometimes', 'nullable', 'string', 'max:255'],
            'acquisition_type' => ['sometimes', 'nullable', 'string', 'max:50'],
            'acquisition_date' => ['sometimes', 'nullable', 'date'],
            'purchase_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'residual_value' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'book_value' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'daily_rental_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'monthly_rental_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'gps_enabled' => ['sometimes', 'nullable', 'boolean'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'branch_id' => ['sometimes', 'nullable', 'uuid'],
            'company_id' => ['sometimes', 'nullable', 'uuid'],
        ];
    }
}

