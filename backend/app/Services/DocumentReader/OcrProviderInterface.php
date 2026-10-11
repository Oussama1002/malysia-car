<?php

namespace App\Services\DocumentReader;

/**
 * Pluggable OCR provider. The MVP uses {@see TesseractOcrProvider};
 * Google Document AI / Azure Document Intelligence can be added later by
 * implementing this interface and swapping the binding in
 * `config/document_reader.php`.
 */
interface OcrProviderInterface
{
    /**
     * @param  string  $absolutePath  Absolute path to a PDF / JPG / JPEG / PNG on the local disk.
     * @param  array{lang?: string, doc_type?: string}  $options
     */
    public function extract(string $absolutePath, array $options = []): OcrResult;

    public function name(): string;
}
