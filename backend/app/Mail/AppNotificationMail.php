<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AppNotificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $notificationTitle,
        public ?string $notificationBody,
        public ?string $actionUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->notificationTitle,
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: $this->buildHtml(),
        );
    }

    private function buildHtml(): string
    {
        $body = $this->notificationBody ? nl2br(e($this->notificationBody)) : '';
        $link = $this->actionUrl
            ? '<p><a href="'.e($this->actionUrl).'">Ouvrir dans DriveFlow</a></p>'
            : '';

        return '<div style="font-family:system-ui,sans-serif;max-width:560px">'
            .'<h2 style="margin:0 0 12px">'.e($this->notificationTitle).'</h2>'
            .'<p style="color:#334155;line-height:1.5">'.$body.'</p>'
            .$link
            .'<p style="color:#94a3b8;font-size:12px;margin-top:24px">Message automatique — ne pas répondre.</p>'
            .'</div>';
    }
}
