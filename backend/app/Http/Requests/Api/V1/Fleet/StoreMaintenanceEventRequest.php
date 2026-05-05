<?php

namespace App\Http\Requests\Api\V1\Fleet;

use App\Http\Requests\ApiFormRequest;

class StoreMaintenanceEventRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        $merge = [];

        if (! $this->filled('type') && $this->filled('event_type')) {
            $merge['type'] = $this->input('event_type');
        }

        if (! $this->filled('performed_at') && $this->filled('completed_date')) {
            $merge['performed_at'] = $this->input('completed_date');
        }

        if (! $this->filled('performed_at') && $this->filled('event_date')) {
            $merge['performed_at'] = $this->input('event_date');
        }

        if (! $this->has('cost_mad') && $this->has('cost_amount')) {
            $merge['cost_mad'] = $this->input('cost_amount');
        }

        if (! $this->has('cost_mad') && $this->has('cost')) {
            $merge['cost_mad'] = $this->input('cost');
        }

        if (! $this->has('odometer_km') && $this->has('mileage_at_service')) {
            $merge['odometer_km'] = $this->input('mileage_at_service');
        }

        if (! $this->filled('vendor') && $this->filled('vendor_name')) {
            $merge['vendor'] = $this->input('vendor_name');
        }

        $this->merge($merge);
    }

    /**
     * Canonical: performed_at, cost_mad (>= 0 when present), type, odometer_km, vendor.
     * Legacy keys (event_type, event_date, completed_date, cost_amount, cost, …) are merged in prepareForValidation().
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'type' => ['nullable', 'string', 'max:80'],
            'title' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:4000'],
            'performed_at' => ['nullable', 'date'],
            'odometer_km' => ['nullable', 'integer', 'min:0', 'max:2000000'],
            'vendor' => ['nullable', 'string', 'max:255'],
            'cost_mad' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
