<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Payment;
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

            // Warn the caller when this cheque already backs a live payment,
            // so the payment form can refuse the scan before the user even
            // fills the rest of the fields.
            $existing = null;
            $chequeNumber = trim((string) ($fields['check_number'] ?? ''));
            $chequeBank   = trim((string) ($fields['bank'] ?? ''));
            if ($chequeNumber !== '') {
                $q = Payment::query()
                    ->where('payment_method', 'check')
                    ->whereRaw('TRIM(check_number) = ?', [$chequeNumber])
                    ->whereNotIn('status', ['reversed', 'refunded']);
                if ($chequeBank !== '') {
                    $q->whereRaw('LOWER(TRIM(COALESCE(check_bank, ""))) = ?', [strtolower($chequeBank)]);
                }
                $row = $q->first(['id', 'payment_number', 'amount', 'payment_date', 'check_bank', 'status']);
                if ($row) {
                    $existing = [
                        'payment_id'     => $row->id,
                        'payment_number' => $row->payment_number,
                        'amount'         => (float) $row->amount,
                        'payment_date'   => optional($row->payment_date)?->toDateString(),
                        'bank'           => $row->check_bank,
                        'status'         => $row->status,
                    ];
                }
            }

            return ApiResponse::success([
                'check_number' => $fields['check_number'] ?? null,
                'bank' => $fields['bank'] ?? null,
                'amount' => $fields['amount'] ?? null,
                'check_date' => $fields['check_date'] ?? null,
                'raw_text' => $extraction?->raw_text ?? null,
                'confidence' => $extraction?->confidence_score ?? null,
                'existing_payment' => $existing,
            ]);
        } catch (\Throwable $e) {
            return ApiResponse::error('OCR a échoué : ' . $e->getMessage(), 422);
        }
    }
}
