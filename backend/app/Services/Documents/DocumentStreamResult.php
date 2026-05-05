<?php

namespace App\Services\Documents;

final class DocumentStreamResult
{
    public function __construct(
        public readonly string $disk,
        public readonly string $storagePath,
        public readonly string $mimeType,
        public readonly string $downloadName,
        public readonly ?string $sha256,
        public readonly string $classification,
        public readonly string $sourceLabel,
    ) {}
}
