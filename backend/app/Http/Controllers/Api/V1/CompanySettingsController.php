<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\CompanySetting;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanySettingsController extends Controller
{
    public function show(Request $request, string $group): JsonResponse
    {
        $companyId = optional($request->user())->company_id;
        $settings = CompanySetting::getAll($group, $companyId);

        return ApiResponse::success(['group' => $group, 'settings' => $settings]);
    }

    public function update(Request $request, string $group): JsonResponse
    {
        $allowed = $this->allowedKeys($group);
        $data = $request->validate([
            'settings' => ['present', 'array'],
            'settings.*' => ['nullable', 'max:500'],
        ]);

        $settings = $data['settings'] ?? [];
        $input = collect($settings)->only($allowed)->map(fn ($v) => $v === null ? null : (string) $v)->toArray();
        $companyId = optional($request->user())->company_id;

        $before = CompanySetting::getAll($group, $companyId);
        CompanySetting::setAll($group, $companyId, $input);
        $after = CompanySetting::getAll($group, $companyId);

        AuditLogger::record(
            action: 'settings_updated',
            user: $request->user(),
            entityType: 'company_settings',
            entityId: $group,
            before: $before,
            after: $after,
            module: 'admin',
            label: 'Paramètres modifiés : '.$group,
            request: $request,
        );

        return ApiResponse::success(['group' => $group, 'settings' => $after]);
    }

    private function allowedKeys(string $group): array
    {
        return match ($group) {
            'contracts' => [
                'default_km_per_day',
                'default_deposit_mad',
                'default_payment_day',
                'default_payment_terms',
                'lld_min_days',
                'lld_max_days',
                'lcd_min_days',
                'lcd_max_days',
                'loa_min_days',
                'loa_max_days',
                'credit_min_days',
                'credit_max_days',
                'default_tax_rate',
                'default_penalty_per_km',
                'default_daily_rate_mad',
                'default_monthly_rate_mad',
            ],
            'reservations' => [
                'default_reservation_type',
                'auto_confirm',
                'max_reservation_days',
                'min_reservation_hours',
            ],
            default => [],
        };
    }
}
