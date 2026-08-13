<?php

/**
 * Softnovation Document Reader — OCR & parser configuration.
 *
 * The MVP ships with Tesseract (free, self-hosted). Additional providers can be
 * plugged in by implementing OcrProviderInterface and changing `provider`.
 */
return [
    // 'tesseract' (default, free/self-hosted) or 'google_vision' (paid, accurate).
    'provider' => env('DOC_READER_PROVIDER', 'tesseract'),

    'tesseract' => [
        'bin' => env('TESSERACT_BIN', 'tesseract'),
        'pdftoppm_bin' => env('PDFTOPPM_BIN', 'pdftoppm'),
        'lang' => env('TESSERACT_LANG', 'fra+eng'),
        'timeout' => (int) env('TESSERACT_TIMEOUT', 180),
    ],

    // Google Cloud Vision (optional). Set DOC_READER_PROVIDER=google_vision and
    // GOOGLE_VISION_API_KEY to enable. When enabled, Tesseract stays configured
    // as the automatic fallback if Vision is unreachable or misconfigured.
    // Privacy: uploaded documents are sent to Google for processing.
    'google_vision' => [
        'api_key' => env('GOOGLE_VISION_API_KEY', ''),
        'endpoint' => env('GOOGLE_VISION_ENDPOINT', 'https://vision.googleapis.com/v1'),
        'timeout' => (int) env('GOOGLE_VISION_TIMEOUT', 120),
        'max_pdf_pages' => (int) env('GOOGLE_VISION_MAX_PDF_PAGES', 5),
    ],

    'upload' => [
        // 15 MB by default. Keep aligned with the controller validation rule.
        'max_size_kb' => (int) env('DOC_READER_MAX_KB', 15 * 1024),
        'allowed_mimes' => ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif'],
    ],
];
