<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\CompanySetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * GET  /v1/company-settings  → returns the payload (or defaults if none saved)
 * PUT  /v1/company-settings  → overwrites the payload (merged shallowly per section)
 */
class CompanySettingsController extends Controller
{
    /** Default payload used when the row doesn't exist yet. */
    private function defaults(): array
    {
        return [
            'reservations' => [
                'auto_cancel_hours'       => 48,     // draft reservation → cancelled after N hours without confirmation
                'confirmation_lead_hours' => 24,     // remind agent this many hours before start
                'allow_same_day_pickup'   => true,
                'default_type'            => 'SHORT_RENTAL',
                'require_deposit'         => true,
            ],
            'contracts' => [
                'default_km_per_month'    => 2500,
                'default_deposit_mad'     => 3000,
                'default_deposit_pct'     => 0,      // used when > 0, overrides fixed amount
                'default_expected_day'    => 5,
                'default_payment_terms'   => 'À réception',
                'approval_threshold_mad'  => 100000, // above this, require director approval
                'default_penalty_per_day' => 200,
                'contract_number_prefix'  => 'CTR-',
                'contract_number_padding' => 4,
                'auto_generate_pdf'       => true,
            ],
            'invoicing' => [
                'invoice_number_prefix'   => 'FAC-',
                'invoice_number_padding'  => 4,
                'default_tva_pct'         => 20,
                'default_net_days'        => 0,      // due immediately by default
                'due_date_source'         => 'reservation_end', // reservation_end | issue_date_plus_net
                'legal_footer'            => 'Merci pour votre confiance.',
                'currency_code'           => 'MAD',
            ],
            'payments' => [
                'default_currency'        => 'MAD',
                'accept_partial'          => true,
                'cheque_grace_days'       => 3,
                'payment_number_prefix'   => 'PAY-',
            ],
            'notifications' => [
                'insurance_warning_days'      => 30,
                'tech_control_warning_days'   => 30,
                'vignette_warning_days'       => 15,
                'maintenance_warning_km'      => 500,
                'contract_expiry_warning_days'=> 30,
                'send_whatsapp_confirmation'  => true,
                'send_email_reminders'        => true,
            ],
            'branding' => [
                'company_display_name' => '',
                'company_ice'          => '',
                'company_rc'           => '',
                'company_if'           => '',
                'company_cnss'         => '',
                'default_language'     => 'fr',
                'timezone'             => 'Africa/Casablanca',
            ],
        ];
    }

    public function show(Request $request): JsonResponse
    {
        $companyId = optional($request->user())->company_id;
        if (!$companyId) return ApiResponse::error('Aucune entreprise associée.', 400);

        $row = CompanySetting::query()->where('company_id', $companyId)->first();
        $payload = $row?->payload ?? [];
        // Merge saved values on top of defaults so newly added keys always exist.
        $merged = $this->deepMerge($this->defaults(), $payload);

        return ApiResponse::success($merged);
    }

    public function update(Request $request): JsonResponse
    {
        $companyId = optional($request->user())->company_id;
        if (!$companyId) return ApiResponse::error('Aucune entreprise associée.', 400);

        $data = $request->validate([
            'reservations'  => ['sometimes', 'array'],
            'contracts'     => ['sometimes', 'array'],
            'invoicing'     => ['sometimes', 'array'],
            'payments'      => ['sometimes', 'array'],
            'notifications' => ['sometimes', 'array'],
            'branding'      => ['sometimes', 'array'],
        ]);

        $row = CompanySetting::query()->where('company_id', $companyId)->first();
        $current = $row?->payload ?? [];
        $merged  = $this->deepMerge($current, $data);

        if ($row) {
            $row->payload = $merged;
            $row->save();
        } else {
            CompanySetting::query()->create([
                'id'         => (string) Str::uuid(),
                'company_id' => $companyId,
                'payload'    => $merged,
            ]);
        }

        return ApiResponse::success($this->deepMerge($this->defaults(), $merged));
    }

    private function deepMerge(array $base, array $overrides): array
    {
        foreach ($overrides as $k => $v) {
            if (is_array($v) && isset($base[$k]) && is_array($base[$k])) {
                $base[$k] = $this->deepMerge($base[$k], $v);
            } else {
                $base[$k] = $v;
            }
        }
        return $base;
    }
}
