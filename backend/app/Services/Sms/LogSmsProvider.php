<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class LogSmsProvider implements SmsProviderInterface
{
    public function key(): string
    {
        return 'log';
    }

    public function send(string $e164Phone, string $message): array
    {
        $id = 'log_'.Str::uuid()->toString();
        Log::info('notification.sms.log_provider', [
            'to' => $e164Phone,
            'message' => $message,
            'provider_message_id' => $id,
        ]);

        return ['success' => true, 'provider_message_id' => $id];
    }
}
