<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ReaderDocument;
use App\Services\DocumentReader\DocumentReaderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Quick OCR endpoint for cheque scanning in the payment form.
 * Synchronous: uploads the image, runs Tesseract, parses, returns fields.
 *
 * POST /v1/cheque-ocr  (multipart: file)
 */
class ChequeOcrController extends Controller
{
    public function __construct(private readonly DocumentReaderService $reader) {}

    public function __invoke(Request $request): JsonResponse
    {
        @set_time_limit(120);

        $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:jpg,jpeg,png,pdf'],
        ]);

        $missing = $this->reader->missingBinaries();
        if ($missing !== []) {
            return ApiResponse::error(
                'OCR indisponible : binaires manquants (' . implode(', ', $missing) . ').',
                503,
                ['missing' => $missing],
            );
        }

        $user = $request->user();
        $doc = $this->reader->ingest($request->file('file'), $user, ReaderDocument::TYPE_CHEQUE);

        try {
            $this->reader->extract($doc, ReaderDocument::TYPE_CHEQUE);
            $doc->refresh();
            $doc->load('latestExtraction');

            $extraction = $doc->latestExtraction;
            $fields = $extraction?->extracted_data ?? [];

            return ApiResponse::success([
                'check_number' => $fields['check_number'] ?? null,
                'bank' => $fields['bank'] ?? null,
                'amount' => $fields['amount'] ?? null,
                'check_date' => $fields['check_date'] ?? null,
                'raw_text' => $extraction?->raw_text ?? null,
                'confidence' => $extraction?->confidence_score ?? null,
            ]);
        } catch (\Throwable $e) {
            return ApiResponse::error('OCR a échoué : ' . $e->getMessage(), 422);
        }
    }
}
