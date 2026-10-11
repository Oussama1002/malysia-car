<?php

namespace App\Services\DocumentReader;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

/**
 * Google Cloud Vision OCR provider (optional, paid).
 *
 * Uses the Vision REST API with an API key — no SDK dependency. Vision's
 * DOCUMENT_TEXT_DETECTION is dramatically more accurate than Tesseract on
 * noisy phone scans (it reads the small VIN / fiscal-power digits and dates
 * on a Moroccan carte grise that Tesseract mangles).
 *
 * - Images (jpg/png): POST base64 to images:annotate.
 * - PDFs: POST base64 to files:annotate (synchronous, up to 5 pages). No local
 *   rendering needed — Google rasterises the pages itself at high quality.
 *
 * Privacy note: the uploaded document is sent to Google for processing.
 *
 * Config: config/document_reader.php → google_vision.api_key / endpoint / timeout.
 * Enable by setting DOC_READER_PROVIDER=google_vision and GOOGLE_VISION_API_KEY.
 *
 * If a fallback provider is supplied it is used whenever Vision is not
 * configured or the API call fails, so a misconfiguration never breaks OCR.
 */
class GoogleVisionOcrProvider implements OcrProviderInterface
{
    public function __construct(
        private readonly string $apiKey = '',
        private readonly string $endpoint = 'https://vision.googleapis.com/v1',
        private readonly int $timeoutSeconds = 120,
        private readonly int $maxPdfPages = 5,
        private readonly ?OcrProviderInterface $fallback = null,
    ) {}

    public function name(): string
    {
        return 'google_vision';
    }

    public function extract(string $absolutePath, array $options = []): OcrResult
    {
        if (! is_file($absolutePath)) {
            throw new RuntimeException("OCR source file not found: {$absolutePath}");
        }

        // No key configured → fall back (or fail clearly).
        if ($this->apiKey === '') {
            return $this->fallbackOrThrow($absolutePath, $options, 'Google Vision API key not configured');
        }

        try {
            $ext = strtolower(pathinfo($absolutePath, PATHINFO_EXTENSION));
            $text = $ext === 'pdf'
                ? $this->extractPdf($absolutePath)
                : $this->extractImage($absolutePath);

            // Empty result is suspicious — let the fallback have a go.
            if (trim($text) === '' && $this->fallback !== null) {
                return $this->fallbackOrThrow($absolutePath, $options, 'Google Vision returned empty text');
            }

            return new OcrResult(rawText: trim($text), confidence: null, provider: $this->name());
        } catch (Throwable $e) {
            Log::warning('google_vision.extract_failed', ['error' => $e->getMessage()]);

            return $this->fallbackOrThrow($absolutePath, $options, $e->getMessage());
        }
    }

    private function extractImage(string $path): string
    {
        $content = base64_encode((string) file_get_contents($path));
        $response = Http::timeout($this->timeoutSeconds)
            ->post($this->endpoint.'/images:annotate?key='.$this->apiKey, [
                'requests' => [[
                    'image' => ['content' => $content],
                    'features' => [['type' => 'DOCUMENT_TEXT_DETECTION']],
                    'imageContext' => ['languageHints' => ['fr', 'ar', 'en']],
                ]],
            ]);

        if (! $response->successful()) {
            throw new RuntimeException('Vision images:annotate failed: '.$response->status().' '.$response->body());
        }

        return (string) ($response->json('responses.0.fullTextAnnotation.text') ?? '');
    }

    private function extractPdf(string $path): string
    {
        $content = base64_encode((string) file_get_contents($path));
        $response = Http::timeout($this->timeoutSeconds)
            ->post($this->endpoint.'/files:annotate?key='.$this->apiKey, [
                'requests' => [[
                    'inputConfig' => [
                        'mimeType' => 'application/pdf',
                        'content' => $content,
                    ],
                    'features' => [['type' => 'DOCUMENT_TEXT_DETECTION']],
                    'imageContext' => ['languageHints' => ['fr', 'ar', 'en']],
                    // Synchronous files:annotate processes the first 5 pages by
                    // default — enough for a recto/verso carte grise. Requesting
                    // explicit page numbers can error if the PDF has fewer, so we
                    // let Vision pick.
                ]],
            ]);

        if (! $response->successful()) {
            throw new RuntimeException('Vision files:annotate failed: '.$response->status().' '.$response->body());
        }

        // files:annotate returns one response per page under responses[0].responses[].
        $pages = $response->json('responses.0.responses') ?? [];
        $text = '';
        foreach ($pages as $page) {
            $text .= ($page['fullTextAnnotation']['text'] ?? '')."\n\n";
        }

        return $text;
    }

    private function fallbackOrThrow(string $path, array $options, string $reason): OcrResult
    {
        if ($this->fallback !== null) {
            Log::info('google_vision.fallback', ['reason' => $reason, 'to' => $this->fallback->name()]);

            return $this->fallback->extract($path, $options);
        }

        throw new RuntimeException('Google Vision OCR failed and no fallback configured: '.$reason);
    }
}
