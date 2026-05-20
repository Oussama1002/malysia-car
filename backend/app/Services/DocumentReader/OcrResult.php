<?php

namespace App\Services\DocumentReader;

/**
 * Provider-agnostic OCR output.
 */
class OcrResult
{
    public function __construct(
        public readonly string $rawText,
        public readonly ?float $confidence = null,
        public readonly string $provider = 'tesseract',
    ) {}
}
