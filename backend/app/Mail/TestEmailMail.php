<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TestEmailMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public string $recipient) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'DriveFlow — Email de test');
    }

    public function content(): Content
    {
        $when = now()->format('d/m/Y H:i');

        return new Content(
            htmlString: <<<HTML
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;color:#0f172a">
  <h2 style="margin:0 0 12px;font-weight:800">Configuration SMTP validée ✅</h2>
  <p style="color:#334155;line-height:1.55;margin:0 0 12px">
    Cet email confirme que l'envoi depuis DriveFlow fonctionne pour
    <strong>{$this->recipient}</strong>.
  </p>
  <p style="color:#64748b;font-size:12px;margin:0">Envoyé le {$when}.</p>
</div>
HTML,
        );
    }
}
