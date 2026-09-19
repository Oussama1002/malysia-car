<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetLinkMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $email,
        public string $resetUrl,
        public int $ttlMinutes = 60,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'DriveFlow — Réinitialisation de votre mot de passe',
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: $this->buildHtml(),
            textString: $this->buildText(),
        );
    }

    private function buildHtml(): string
    {
        $url = e($this->resetUrl);
        $ttl = (int) $this->ttlMinutes;

        return <<<HTML
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;color:#0f172a">
  <h2 style="margin:0 0 12px;font-weight:800">Réinitialisation de votre mot de passe</h2>
  <p style="color:#334155;line-height:1.55;margin:0 0 16px">
    Vous avez demandé la réinitialisation du mot de passe associé à
    <strong>{$this->email}</strong>. Cliquez sur le bouton ci-dessous pour définir
    un nouveau mot de passe. Ce lien expire dans {$ttl} minutes.
  </p>
  <p style="margin:24px 0">
    <a href="{$url}"
       style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 22px;
              border-radius:12px;font-weight:700;text-decoration:none">
      Réinitialiser mon mot de passe
    </a>
  </p>
  <p style="color:#64748b;font-size:12px;line-height:1.5;margin:0 0 8px">
    Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
  </p>
  <p style="color:#334155;font-size:12px;word-break:break-all;margin:0 0 24px">
    <a href="{$url}" style="color:#4f46e5">{$url}</a>
  </p>
  <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0">
    Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message —
    votre mot de passe restera inchangé.
  </p>
</div>
HTML;
    }

    private function buildText(): string
    {
        return "Réinitialisation de votre mot de passe DriveFlow\n\n"
            ."Ouvrez ce lien pour définir un nouveau mot de passe (valable {$this->ttlMinutes} min) :\n"
            .$this->resetUrl."\n\n"
            ."Si vous n'êtes pas à l'origine de la demande, ignorez ce message.";
    }
}
