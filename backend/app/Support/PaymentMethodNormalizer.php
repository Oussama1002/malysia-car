<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Normalizes payment method input (FR labels, EN API values, legacy) to canonical DB values.
 *
 * Canonical: bank_transfer, check, cash, card, other, compensation
 */
final class PaymentMethodNormalizer
{
    /** @var array<string, string> */
    private const MAP = [
        'virement' => 'bank_transfer',
        'bank_transfer' => 'bank_transfer',
        'wire' => 'bank_transfer',
        'cheque' => 'check',
        'chèque' => 'check',
        'check' => 'check',
        'espece' => 'cash',
        'espèce' => 'cash',
        'especes' => 'cash',
        'espèces' => 'cash',
        'cash' => 'cash',
        'carte' => 'card',
        'card' => 'card',
        'autre' => 'other',
        'other' => 'other',
        'compensation' => 'compensation',
    ];

    public static function normalize(?string $raw): ?string
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        $k = mb_strtolower(trim($raw));
        $k = str_replace(['’', '`'], "'", $k);

        return self::MAP[$k] ?? $k;
    }

    /**
     * @return list<string>
     */
    public static function allowedValues(): array
    {
        return array_values(array_unique(array_merge(
            array_values(self::MAP),
            ['bank_transfer', 'check', 'cash', 'card', 'other', 'compensation']
        )));
    }
}
