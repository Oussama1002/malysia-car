<?php

namespace App\Http\Resources;

use App\Models\CreditApplication;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin CreditApplication */
class CreditApplicationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var CreditApplication $a */
        $a = $this->resource;

        return [
            'id' => $a->id,
            'customerId' => $a->customer_id,
            'vehicleId' => $a->vehicle_id,
            'applicationType' => $a->application_type,
            'requestedAmount' => $a->requested_amount !== null ? (float) $a->requested_amount : null,
            'downPaymentAmount' => $a->down_payment_amount !== null ? (float) $a->down_payment_amount : null,
            'requestedDurationMonths' => $a->requested_duration_months,
            'monthlyIncome' => $a->monthly_income !== null ? (float) $a->monthly_income : null,
            'monthlyDebt' => $a->monthly_debt !== null ? (float) $a->monthly_debt : null,
            'debtRatio' => $a->debt_ratio !== null ? (float) $a->debt_ratio : null,
            'scoringStatus' => $a->scoring_status,
            'decisionStatus' => $a->decision_status,
            'submittedAt' => optional($a->submitted_at)?->toIso8601String(),
            'decidedAt' => optional($a->decided_at)?->toIso8601String(),
            'decidedBy' => $a->decided_by,
            'rejectionReason' => $a->rejection_reason,
            'createdAt' => optional($a->created_at)?->toIso8601String(),
            'updatedAt' => optional($a->updated_at)?->toIso8601String(),
        ];
    }
}

