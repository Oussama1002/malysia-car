<?php

namespace App\Services\DocumentReader;

use App\Models\ReaderDocument;
use App\Models\ReaderDocumentExtraction;
use App\Models\User;
use App\Services\DocumentService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * Glue layer: file upload → OCR → parsing → DB persistence.
 *
 * The service NEVER auto-saves extracted data on a business entity. Validated
 * data lands on `reader_document_extractions.validated_data` only after the
 * admin calls the validate endpoint. Linking to a client / vehicle / contract
 * is a separate, explicit step.
 */
class DocumentReaderService
{
    public function __construct(
        private readonly DocumentService $documents,
        private readonly OcrProviderInterface $ocr,
        private readonly DocumentParser $parser,
    ) {}

    /**
     * Return the list of OCR binaries that are NOT reachable on the host.
     * The controller calls this before running OCR so it can return a clear
     * JSON error instead of letting Symfony Process hang.
     *
     * @return list<string>
     */
    public function missingBinaries(): array
    {
        $cfg = (array) config('document_reader.tesseract', []);
        $tesseract = (string) ($cfg['bin'] ?? 'tesseract');
        $pdftoppm = (string) ($cfg['pdftoppm_bin'] ?? 'pdftoppm');

        $missing = [];
        if (! $this->binaryReachable($tesseract)) {
            $missing[] = 'tesseract';
        }
        if (! $this->binaryReachable($pdftoppm)) {
            $missing[] = 'pdftoppm';
        }

        return $missing;
    }

    private function binaryReachable(string $bin): bool
    {
        // Absolute / relative path → file_exists is authoritative.
        if (str_contains($bin, DIRECTORY_SEPARATOR) || preg_match('#[\\\\/]#', $bin)) {
            return is_file($bin) || is_file($bin.'.exe');
        }

        // Bare command → probe PATH.
        $isWin = stripos(PHP_OS_FAMILY, 'Win') === 0;
        $probe = $isWin ? "where {$bin}" : "command -v {$bin}";
        $out = @shell_exec($probe.' 2>&1');

        return is_string($out) && trim($out) !== '' && ! str_contains(strtolower($out), 'not found') && ! str_contains(strtolower($out), 'could not find');
    }

    /**
     * Persist the upload and create a pending `reader_documents` row.
     */
    public function ingest(UploadedFile $upload, User $user, ?string $hintedType = null): ReaderDocument
    {
        $file = $this->documents->storeUploadedFile($upload, $user, 'document-reader');

        return ReaderDocument::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $user->company_id,
            'file_id' => $file->id,
            'file_path' => $file->storage_path,
            'file_name' => $file->original_name,
            'mime_type' => $file->mime_type,
            'file_size' => $file->file_size,
            'document_type' => $hintedType && in_array($hintedType, ReaderDocument::TYPES, true)
                ? $hintedType
                : ReaderDocument::TYPE_OTHER,
            'status' => ReaderDocument::STATUS_PENDING,
            'created_by' => $user->id,
        ]);
    }

    /**
     * Run OCR + parser. Returns the freshly created extraction row.
     *
     * Errors (missing binary, unreadable file, etc.) set the document status
     * to `failed` and persist `error_message` so the admin sees a clear hint.
     */
    public function extract(ReaderDocument $document, ?string $hintedType = null): ReaderDocumentExtraction
    {
        @set_time_limit(0);
        @ignore_user_abort(true);

        $document->update(['status' => ReaderDocument::STATUS_PROCESSING]);

        $disk = Storage::disk(config('filesystems.default', 'local'));
        $absolute = $disk->path($document->file_path);

        try {
            $ocr = $this->ocr->extract($absolute, ['doc_type' => $hintedType ?? $document->document_type]);
            $parsed = $this->parser->parse($ocr->rawText, $hintedType ?? $document->document_type);

            return DB::transaction(function () use ($document, $ocr, $parsed) {
                $document->update([
                    'document_type' => $parsed['type'],
                    'status' => ReaderDocument::STATUS_EXTRACTED,
                    'error_message' => null,
                ]);

                $extractedData = $parsed['fields'];
                if (! empty($parsed['type_mismatch'])) {
                    $extractedData['_type_mismatch'] = $parsed['type_mismatch'];
                }

                return ReaderDocumentExtraction::query()->create([
                    'id' => (string) Str::uuid(),
                    'document_id' => $document->id,
                    'provider' => $ocr->provider,
                    'raw_text' => $ocr->rawText,
                    'extracted_data' => $extractedData,
                    'validated_data' => null,
                    'confidence_score' => $ocr->confidence,
                    'status' => ReaderDocumentExtraction::STATUS_DRAFT,
                ]);
            });
        } catch (Throwable $e) {
            Log::warning('document_reader.extract_failed', [
                'document_id' => $document->id,
                'error' => $e->getMessage(),
            ]);
            $document->update([
                'status' => ReaderDocument::STATUS_FAILED,
                'error_message' => $this->humanizeError($e->getMessage()),
            ]);
            throw $e;
        }
    }

    /**
     * Save the admin-corrected fields as the authoritative `validated_data`.
     *
     * @param  array<string, mixed>  $validatedFields
     */
    public function validate(
        ReaderDocument $document,
        array $validatedFields,
        User $user,
        ?string $linkedEntityType = null,
        ?string $linkedEntityId = null,
    ): ReaderDocumentExtraction {
        return DB::transaction(function () use ($document, $validatedFields, $user, $linkedEntityType, $linkedEntityId) {
            $extraction = $document->latestExtraction()->firstOrFail();
            $extraction->update([
                'validated_data' => $validatedFields,
                'status' => ReaderDocumentExtraction::STATUS_VALIDATED,
                'validated_by' => $user->id,
                'validated_at' => now(),
            ]);

            $document->update([
                'status' => ReaderDocument::STATUS_VALIDATED,
                'linked_entity_type' => $linkedEntityType ?: $document->linked_entity_type,
                'linked_entity_id' => $linkedEntityId ?: $document->linked_entity_id,
            ]);

            return $extraction->fresh();
        });
    }

    public function link(ReaderDocument $document, string $entityType, string $entityId, ?User $user = null): ReaderDocument
    {
        $document->update([
            'linked_entity_type' => $entityType,
            'linked_entity_id' => $entityId,
        ]);

        // Also surface the original PDF/image in the central document center
        // for that entity, so it appears under the customer/vehicle's
        // "Documents" tab. We pick a category based on the OCR document type.
        if (
            $document->file
            && in_array($entityType, DocumentService::ENTITY_TYPES, true)
        ) {
            $category = match ($document->document_type) {
                ReaderDocument::TYPE_CIN => 'cin',
                ReaderDocument::TYPE_PASSPORT => 'passport',
                ReaderDocument::TYPE_DRIVING_LICENSE => 'driving_license',
                ReaderDocument::TYPE_VEHICLE_REGISTRATION => 'vehicle_registration',
                ReaderDocument::TYPE_RENTAL_CONTRACT => 'rental_contract',
                default => 'identity_document',
            };
            $title = match ($document->document_type) {
                ReaderDocument::TYPE_CIN => 'CIN',
                ReaderDocument::TYPE_PASSPORT => 'Passeport',
                ReaderDocument::TYPE_DRIVING_LICENSE => 'Permis de conduire',
                ReaderDocument::TYPE_VEHICLE_REGISTRATION => 'Carte grise',
                ReaderDocument::TYPE_RENTAL_CONTRACT => 'Contrat de location',
                default => $document->file_name,
            };
            // Don't double-attach if the same file is linked again.
            $exists = \App\Models\EntityAttachment::query()
                ->where('entity_type', $entityType)
                ->where('entity_id', $entityId)
                ->where('file_id', $document->file_id)
                ->exists();
            if (! $exists) {
                $this->documents->attachToEntity(
                    $document->file,
                    $entityType,
                    $entityId,
                    [
                        'category' => $category,
                        'title' => $title,
                        'visibility' => 'internal',
                        'status' => 'active',
                    ],
                    $user,
                );
            }
        }

        return $document->fresh();
    }

    private function humanizeError(string $raw): string
    {
        if (str_contains($raw, 'tesseract')) {
            return "Le binaire 'tesseract' est introuvable ou a échoué. Vérifiez l'installation côté serveur.";
        }
        if (str_contains($raw, 'pdftoppm')) {
            return "Le binaire 'pdftoppm' (poppler-utils) est requis pour les PDF.";
        }
        if (str_contains($raw, 'not found')) {
            return 'Fichier introuvable sur le disque.';
        }

        return 'Échec de l\'extraction OCR. Le document est peut-être flou ou non supporté.';
    }
}
