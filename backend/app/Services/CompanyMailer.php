<?php

namespace App\Services;

use App\Models\CompanySetting;
use Illuminate\Contracts\Mail\Mailable;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;

/**
 * Envoi d'emails via le SMTP configuré par la société dans
 * Paramètres → Intégrations (stocké dans company_settings, groupe
 * `integrations`). Si le SMTP n'est pas renseigné, on retombe sur le mailer
 * du .env. Inspiré du BrandMailer d'un système existant.
 */
class CompanyMailer
{
    /**
     * Construit (ou réutilise) un mailer SMTP pour la société et renvoie
     * [nomDuMailer, adresseExpéditeur, nomExpéditeur].
     */
    public static function resolve(?string $companyId): array
    {
        $s = CompanySetting::getAll('integrations', $companyId);

        // Déploiement mono-agence : le SMTP a pu être enregistré sous un autre
        // company_id (ou null) que celui de l'utilisateur ciblé. On retombe
        // alors sur la première configuration SMTP renseignée, quelle que soit
        // la société, pour que l'envoi marche quand même.
        if (trim((string) ($s['smtp_host'] ?? '')) === '') {
            $row = CompanySetting::where('group', 'integrations')
                ->where('key', 'smtp_host')
                ->whereNotNull('value')
                ->where('value', '!=', '')
                ->first();
            if ($row) {
                $s = CompanySetting::getAll('integrations', $row->company_id);
            }
        }

        $host = trim((string) ($s['smtp_host'] ?? ''));
        $user = trim((string) ($s['smtp_user'] ?? ''));
        $pass = (string) ($s['smtp_password'] ?? '');

        $fromName = trim((string) ($s['smtp_sender_name'] ?? ''));
        $fromAddr = trim((string) ($s['smtp_from_address'] ?? ''));

        // SMTP non configuré → mailer du .env.
        if ($host === '' || $user === '' || $pass === '') {
            return [
                (string) config('mail.default', 'log'),
                (string) config('mail.from.address', 'hello@example.com'),
                (string) config('mail.from.name', 'DriveFlow'),
            ];
        }

        // Les mots de passe d'application Gmail sont affichés avec des espaces.
        if (str_contains(strtolower($host), 'gmail') || str_contains(strtolower($host), 'google')) {
            $pass = str_replace(' ', '', $pass);
        }

        $encryption = strtolower(trim((string) ($s['smtp_encryption'] ?? '')));
        $port = (int) ($s['smtp_port'] ?? 0);

        if ($encryption === '' || $encryption === 'none' || $encryption === 'null') {
            $encryption = $port === 465 ? 'ssl' : 'tls';
        }
        if ($port === 0) {
            $port = $encryption === 'ssl' ? 465 : 587;
        }
        $scheme = $encryption === 'ssl' ? 'smtps' : 'smtp';

        $name = 'company_'.($companyId ?: 'default');
        Config::set("mail.mailers.$name", [
            'transport' => 'smtp',
            'scheme' => $scheme,
            'host' => $host,
            'port' => $port,
            'username' => $user,
            'password' => $pass,
            'timeout' => 15,
        ]);
        // Purge l'instance en cache pour que la nouvelle config prenne effet.
        app('mail.manager')->purge($name);

        return [
            $name,
            $fromAddr !== '' ? $fromAddr : $user,
            $fromName !== '' ? $fromName : (string) config('mail.from.name', 'DriveFlow'),
        ];
    }

    /** Envoie un Mailable avec le SMTP de la société. */
    public static function send(?string $companyId, string $to, Mailable $mailable): void
    {
        [$name, $fromAddr, $fromName] = self::resolve($companyId);
        Mail::mailer($name)->to($to)->send($mailable->from($fromAddr, $fromName));
    }

    /** Traduit une erreur SMTP en message lisible pour l'admin. */
    public static function translateError(\Throwable $e): string
    {
        $m = strtolower($e->getMessage());
        if (str_contains($m, '535') || str_contains($m, 'authentication') || str_contains($m, 'username and password')) {
            return "Authentification SMTP refusée — vérifiez l'utilisateur et le mot de passe (Paramètres → Intégrations).";
        }
        if (str_contains($m, 'timed out') || str_contains($m, 'timeout') ||
            str_contains($m, 'could not connect') || str_contains($m, 'connection refused') ||
            str_contains($m, 'getaddrinfo')) {
            return "Serveur SMTP injoignable — vérifiez l'hôte et le port (Paramètres → Intégrations).";
        }
        if (str_contains($m, 'ssl') || str_contains($m, 'tls') || str_contains($m, 'certificate')) {
            return "Erreur de chiffrement SSL/TLS — vérifiez le port et le type de chiffrement (Paramètres → Intégrations).";
        }
        return "Échec de l'envoi de l'email. Vérifiez la configuration SMTP (Paramètres → Intégrations).";
    }
}
