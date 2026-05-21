<?php

namespace App\Jobs;

use App\Models\ReaderDocument;
use App\Services\DocumentReader\DocumentReaderService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/**
 * Runs Tesseract OCR in the background so the HTTP request returns immediately
 * (202 Accepted). The frontend polls GET /v1/document-reader/documents/{id}
 * every 3 seconds until status ∈ {extracted, failed}.
 *
 * Timeout is intentionally generous (10 min) — OCR of a large multi-page PDF
 * can legitimately take several minutes on a slow box. There is no nginx
 * timeout involved because the HTTP connection is already closed.
 */
class ProcessDocumentOcrJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Max time (seconds) the job may run before being force-killed. */
    public int $timeout = 600;

    /** Never retry failed OCR — a second attempt on the same broken file
     *  would just waste CPU and confuse the admin. */
    public int $tries = 1;

    public function __construct(
        private readonly ReaderDocument $document,
        private readonly ?string $hintedType,
    ) {}

    public function handle(DocumentReaderService $reader): void
    {
        // DocumentReaderService::extract() handles status updates (processing →
        // extracted | failed) and writes the error_message on failure, so we
        // only need to call it — no extra try/catch required here.
        $reader->extract($this->document, $this->hintedType);
    }

    /**
     * Laravel calls this when the job has exhausted its attempts.
     * Guarantee the document ends up in a terminal state so the frontend
     * stops polling.
     */
    public function failed(Throwable $e): void
    {
        // Reload to avoid clobbering changes made by extract() before it threw.
        $fresh = $this->document->fresh();
        if ($fresh && $fresh->status === ReaderDocument::STATUS_PROCESSING) {
            $fresh->update([
                'status' => ReaderDocument::STATUS_FAILED,
                'error_message' => 'Échec de l\'extraction OCR (worker timeout ou crash).',
            ]);
        }
    }
}
