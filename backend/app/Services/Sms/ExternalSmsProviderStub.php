<?php

namespace App\Services\Sms;

use Illuminate\Support\Str;

/**
 * Placeholder for Twilio / OVH / etc. Returns deterministic stub IDs until wired.
 */
class ExternalSmsProviderStub implements SmsProviderInterface
{
    public function key(): string
    {
        return 'external';
    }

    public function send(string $e164Phone, string $message): array
    {
        $id = 'ext_stub_'.Str::uuid()->toString();

        return [
            'success' => true,
            'provider_message_id' => $id,
        ];
    }
}
