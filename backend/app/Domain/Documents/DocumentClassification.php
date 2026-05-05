<?php

namespace App\Domain\Documents;

/**
 * Security / retention classification for document access rules.
 */
final class DocumentClassification
{
    public const PUBLIC = 'public';

    public const INTERNAL = 'internal';

    public const CONFIDENTIAL = 'confidential';

    public const LEGAL = 'legal';

    public const FINANCIAL = 'financial';

    public const KYC = 'kyc';

    public const SIGNED_CONTRACT = 'signed_contract';

    /** @return list<string> */
    public static function all(): array
    {
        return [
            self::PUBLIC,
            self::INTERNAL,
            self::CONFIDENTIAL,
            self::LEGAL,
            self::FINANCIAL,
            self::KYC,
            self::SIGNED_CONTRACT,
        ];
    }

    /** Stored value on row wins when it is a known classification. */
    public static function forAttachment(?string $stored, string $entityType, string $category): string
    {
        if ($stored && in_array($stored, self::all(), true)) {
            return $stored;
        }
        $c = strtolower($category);
        $e = strtolower($entityType);

        return match (true) {
            $e === 'kyc_case' => self::KYC,
            str_contains($c, 'legal') || str_contains($c, 'contentieux') => self::LEGAL,
            str_contains($c, 'invoice') || str_contains($c, 'finance') => self::FINANCIAL,
            default => self::INTERNAL,
        };
    }

    public static function forGenerated(?string $stored, string $documentType): string
    {
        if ($stored && in_array($stored, self::all(), true)) {
            return $stored;
        }
        $t = strtolower($documentType);

        return match (true) {
            str_contains($t, 'signed') => self::SIGNED_CONTRACT,
            str_contains($t, 'invoice') => self::FINANCIAL,
            str_contains($t, 'contract') => self::FINANCIAL,
            str_contains($t, 'certificate') => self::SIGNED_CONTRACT,
            default => self::INTERNAL,
        };
    }
}
