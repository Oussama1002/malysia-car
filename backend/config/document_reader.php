<?php

/**
 * Softnovation Document Reader — OCR & parser configuration.
 *
 * The MVP ships with Tesseract (free, self-hosted). Additional providers can be
 * plugged in by implementing OcrProviderInterface and changing `provider`.
 */
return [
    // 'tesseract' (default) — future: 'google_document_ai', 'azure_document_intelligence'
    'provider' => env('DOC_READER_PROVIDER', 'tesseract'),

    'tesseract' => [
        'bin' => env('TESSERACT_BIN', 'tesseract'),
        'pdftoppm_bin' => env('PDFTOPPM_BIN', 'pdftoppm'),
        'lang' => env('TESSERACT_LANG', 'eng+fra+ara'),
        'timeout' => (int) env('TESSERACT_TIMEOUT', 180),
    ],

    'upload' => [
        // 15 MB by default. Keep aligned with the controller validation rule.
        'max_size_kb' => (int) env('DOC_READER_MAX_KB', 15 * 1024),
        'allowed_mimes' => ['pdf', 'jpg', 'jpeg', 'png'],
    ],
];
