<?php

namespace App\Services\Sms;

interface SmsProviderInterface
{
    /**
     * @return array{success: bool, provider_message_id?: string|null, error?: string|null}
     */
    public function send(string $e164Phone, string $message): array;

    public function key(): string;
}
