<?php

namespace App\Http\Resources;

use App\Models\Contract;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Contract */
class ContractResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Contract $c */
        $c = $this->resource;

        return [
            'id' => $c->id,
            'reference' => $c->contract_number,
            'type' => $c->contract_type,
            'status' => $c->status,
            'legalStatus' => $c->legal_status,
            'signatureStatus' => $c->signature_status,
            'customerId' => $c->customer_id,
            'vehicleId' => $c->vehicle_id,
            'templateId' => $c->template_id,
            'creditApplicationId' => $c->credit_application_id,
            'startDate' => optional($c->start_date)?->toDateString(),
            'endDate' => optional($c->end_date)?->toDateString(),
            'durationMonths' => $c->duration_months,
            'currencyCode' => $c->currency_code,
            'baseAmount' => $c->base_amount !== null ? (float) $c->base_amount : null,
            'monthlyPayment' => $c->monthly_payment !== null ? (float) $c->monthly_payment : null,
            'downPaymentAmount' => $c->down_payment_amount !== null ? (float) $c->down_payment_amount : null,
            'buyoutOptionAmount' => $c->buyout_option_amount !== null ? (float) $c->buyout_option_amount : null,
            'allowedKm' => $c->allowed_km !== null ? (float) $c->allowed_km : null,
            'excessKmRate' => $c->excess_km_rate !== null ? (float) $c->excess_km_rate : null,
            'depositAmount' => $c->deposit_amount !== null ? (float) $c->deposit_amount : null,
            'insuranceIncluded' => (bool) $c->insurance_included,
            'maintenanceIncluded' => (bool) $c->maintenance_included,
            'activationDate' => optional($c->activation_date)?->toIso8601String(),
            'closureDate' => optional($c->closure_date)?->toIso8601String(),
            'signedAt' => optional($c->signed_at)?->toIso8601String(),
            'terminatedReason' => $c->terminated_reason,
            'notes' => $c->notes,
            'paymentMethod' => $c->payment_method,
            'paymentTerms' => $c->payment_terms,
            'bankReference' => $c->bank_reference,
            'chequeNumber' => $c->cheque_number,
            'expectedPaymentDay' => $c->expected_payment_day,
            'createdAt' => optional($c->created_at)?->toIso8601String(),
            'updatedAt' => optional($c->updated_at)?->toIso8601String(),
        ];
    }
}

