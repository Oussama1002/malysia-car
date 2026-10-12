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
        // Les réglages opérationnels (contracts, reservations…) sont lisibles
        // par tout utilisateur authentifié — les pages Réservations/Contrats en
        // ont besoin. Les intégrations (SMTP) restent réservées aux admins.
        if ($group === 'integrations') {
            $codes = $request->user()?->roleCodes() ?? [];
            if (! array_intersect(['ADMIN', 'DIRECTEUR'], $codes)) {
                abort(403);
            }
        }

        $companyId = optional($request->user())->company_id;
        $settings = CompanySetting::getAll($group, $companyId);

        // Ne jamais renvoyer le mot de passe SMTP en clair : on expose
        // seulement un indicateur « déjà renseigné ».
        if ($group === 'integrations') {
            $hasPwd = ! empty($settings['smtp_password']);
            $settings['smtp_password'] = '';
            $settings['smtp_password_set'] = $hasPwd ? '1' : '0';
        }

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

        // Mot de passe SMTP : on ne l'écrase que si une nouvelle valeur est
        // fournie (l'UI envoie vide quand l'admin ne change pas le secret).
        if ($group === 'integrations' &&
            (! isset($input['smtp_password']) || trim((string) $input['smtp_password']) === '')) {
            unset($input['smtp_password']);
        }

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
                'default_km_per_month',
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
            'integrations' => [
                'smtp_host',
                'smtp_port',
                'smtp_user',
                'smtp_password',
                'smtp_encryption',
                'smtp_sender_name',
                'smtp_from_address',
            ],
            default => [],
        };
    }

    /**
     * Envoie un email de test via le SMTP configuré (Paramètres →
     * Intégrations) à l'adresse de l'utilisateur courant, pour valider les
     * réglages avant de compter dessus pour les resets de mot de passe.
     */
    public function testEmail(Request $request): JsonResponse
    {
        $user = $request->user();
        // Par défaut, on envoie le test à l'adresse SMTP configurée
        // (smtp_from_address ou smtp_user), pas à l'email de login de l'admin.
        $integrations = CompanySetting::getAll('integrations', optional($user)->company_id);
        $configured = trim((string) ($integrations['smtp_from_address'] ?? ''))
            ?: trim((string) ($integrations['smtp_user'] ?? ''));
        $to = $request->input('to') ?: ($configured ?: optional($user)->email);
        if (! $to) {
            return ApiResponse::message('Aucune adresse de destination.', 422);
        }

        try {
            \App\Services\CompanyMailer::send(
                optional($user)->company_id,
                (string) $to,
                new \App\Mail\TestEmailMail((string) $to),
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('smtp test failed', ['error' => $e->getMessage()]);
            // L'endpoint est réservé aux admins : on renvoie l'erreur SMTP
            // brute (tronquée) en plus du message traduit pour diagnostiquer.
            $raw = trim($e->getMessage());
            if (mb_strlen($raw) > 300) {
                $raw = mb_substr($raw, 0, 300).'…';
            }
            $msg = \App\Services\CompanyMailer::translateError($e).' — '.$raw;

            return ApiResponse::message($msg, 422);
        }

        return ApiResponse::success(['message' => "Email de test envoyé à {$to}."]);
    }
}
