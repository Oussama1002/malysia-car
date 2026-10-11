<?php

namespace App\Services;

use App\Models\File;
use App\Models\ReaderDocument;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Attach a scan already ingested by the document reader (a cheque, an ID…) to
 * the record it justifies, so the payment history can show the proof.
 */
class ScanEvidenceService
{
    public function __construct(private readonly DocumentService $documents) {}

    /**
     * @param  string|null  $documentId  reader_documents.id returned by the scan
     */
    public function attach(
        ?string $documentId,
        string $entityType,
        string $entityId,
        ?User $user,
        string $category = 'cheque_scan',
        ?string $title = null,
    ): void {
        if (! $documentId || ! in_array($entityType, DocumentService::ENTITY_TYPES, true)) {
            return;
        }

        try {
            $document = ReaderDocument::query()->find($documentId);
            $file = $document?->file_id ? File::query()->find($document->file_id) : null;
            if (! $file) {
                return;
            }

            $this->documents->attachToEntity($file, $entityType, $entityId, [
                'category' => $category,
                'title' => $title ?? $document->file_name ?? 'Scan',
                'visibility' => 'internal',
            ], $user);

            $document->update([
                'linked_entity_type' => $entityType,
                'linked_entity_id' => $entityId,
            ]);
        } catch (\Throwable $e) {
            // The payment matters more than its proof: never fail the write.
            Log::warning('scan_evidence.attach_failed', [
                'document_id' => $documentId,
                'entity' => $entityType.':'.$entityId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
