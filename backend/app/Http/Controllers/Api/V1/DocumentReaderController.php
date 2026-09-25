<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Jobs\ProcessDocumentOcrJob;
use App\Models\ReaderDocument;
use App\Services\AuditLogger;
use App\Services\DocumentReader\DocumentReaderService;
use App\Services\Documents\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

/**
 * REST surface for the Softnovation Document Reader module.
 *
 * Workflow:
 *   POST   /v1/document-reader/uploads                      → ingest a file
 *   POST   /v1/document-reader/documents/{id}/extract       → run OCR + parser
 *   GET    /v1/document-reader/documents                    → list
 *   GET    /v1/document-reader/documents/{id}               → show + raw + extracted
 *   POST   /v1/document-reader/documents/{id}/validate      → save corrected fields
 *   POST   /v1/document-reader/documents/{id}/link          → link to entity
 *   GET    /v1/document-reader/documents/{id}/preview       → inline file stream
 *   DELETE /v1/document-reader/documents/{id}               → remove
 */
class DocumentReaderController extends Controller
{
    public function __construct(
        private readonly DocumentReaderService $reader,
        private readonly DocumentAccessService $documentAccess,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = ReaderDocument::query()
            ->with('latestExtraction')
            ->when($user?->company_id, fn ($q, $cid) => $q->where('company_id', $cid))
            ->when($request->query('document_type'), fn ($q, $type) => $q->where('document_type', $type))
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('created_at');

        $page = max(1, (int) $request->query('page', 1));
        $per = min(100, max(1, (int) $request->query('per_page', 25)));
        $paginator = $query->paginate($per, ['*'], 'page', $page);

        return response()->json([
            'data' => array_map(fn ($d) => $this->serialize($d), $paginator->items()),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $doc = $this->find($request, $id);
        $doc->load('latestExtraction');

        return ApiResponse::success($this->serialize($doc, withRawText: true));
    }

    public function upload(Request $request): JsonResponse
    {
        // Large file + OCR-bound flows; outlive php.ini's 30s default so a
        // long render doesn't get killed mid-request and bubble up as an HTML
        // 500 page (which clients try to JSON.parse and choke on).
        @set_time_limit(0);
        @ignore_user_abort(true);

        $maxKb = (int) config('document_reader.upload.max_size_kb', 15 * 1024);
        $data = $request->validate([
            'file' => ['required', 'file', 'max:'.$maxKb, 'mimes:pdf,jpg,jpeg,png,webp,gif,bmp,tif,tiff,heic,heif'],
            'document_type' => ['nullable', 'string', 'in:'.implode(',', ReaderDocument::TYPES)],
        ]);

        $user = $request->user();
        $doc = $this->reader->ingest($request->file('file'), $user, $data['document_type'] ?? null);

        AuditLogger::record(
            'reader_document_uploaded',
            $user,
            'reader_document',
            $doc->id,
            null,
            ['file_name' => $doc->file_name, 'document_type' => $doc->document_type],
            'document_reader',
            false,
            $request,
            'Document Reader — fichier téléversé',
        );

        return ApiResponse::success($this->serialize($doc), null, null, 201);
    }

    public function extract(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'document_type' => ['nullable', 'string', 'in:'.implode(',', ReaderDocument::TYPES)],
        ]);

        $doc = $this->find($request, $id);

        // Fail fast with a clear JSON error if the OCR toolchain is missing.
        $missing = $this->reader->missingBinaries();
        if ($missing !== []) {
            $hint = in_array('pdftoppm', $missing, true)
                ? 'Installez Tesseract OCR et Poppler (pdftoppm), puis ajoutez-les au PATH.'
                : 'Installez Tesseract OCR et ajoutez-le au PATH.';

            return ApiResponse::error(
                'OCR indisponible : binaires manquants ('.implode(', ', $missing).'). '.$hint,
                503,
                ['missing' => $missing],
            );
        }

        // Mark as processing before dispatching so the frontend can start
        // polling immediately.
        $doc->update(['status' => ReaderDocument::STATUS_PROCESSING]);

        // Dispatch OCR to the background queue — the HTTP request returns 202
        // in milliseconds regardless of how long Tesseract takes.
        // Frontend polls GET /documents/{id} every 3 s until status ∈ {extracted, failed}.
        ProcessDocumentOcrJob::dispatch($doc->fresh(), $data['document_type'] ?? null);

        AuditLogger::record(
            'reader_document_extract_queued',
            $request->user(),
            'reader_document',
            $doc->id,
            null,
            ['document_type' => $doc->document_type],
            'document_reader',
            false,
            $request,
            'Document Reader — OCR mis en file d\'attente',
        );

        // 202 Accepted: processing has started but is not yet complete.
        return ApiResponse::success($this->serialize($doc->fresh()), null, null, 202);
    }

    public function validateDocument(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'validated_data' => ['required', 'array'],
            'linked_entity_type' => ['nullable', 'string', 'max:60'],
            'linked_entity_id' => ['nullable', 'string', 'max:36'],
        ]);

        $doc = $this->find($request, $id);
        if (! $doc->latestExtraction()->exists()) {
            return ApiResponse::error('Aucune extraction OCR disponible pour ce document.', 422);
        }

        $extraction = $this->reader->validate(
            $doc,
            $data['validated_data'],
            $request->user(),
            $data['linked_entity_type'] ?? null,
            $data['linked_entity_id'] ?? null,
        );

        AuditLogger::record(
            'reader_document_validated',
            $request->user(),
            'reader_document',
            $doc->id,
            null,
            [
                'extraction_id' => $extraction->id,
                'linked_entity_type' => $doc->fresh()->linked_entity_type,
                'linked_entity_id' => $doc->fresh()->linked_entity_id,
            ],
            'document_reader',
            true,
            $request,
            'Document Reader — données validées',
        );

        return ApiResponse::success($this->serialize($doc->fresh()->load('latestExtraction'), withRawText: true));
    }

    public function link(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'entity_type' => ['required', 'string', 'max:60'],
            'entity_id' => ['required', 'string', 'max:36'],
        ]);

        $doc = $this->find($request, $id);
        $doc = $this->reader->link($doc, $data['entity_type'], $data['entity_id'], $request->user());

        AuditLogger::record(
            'reader_document_linked',
            $request->user(),
            'reader_document',
            $doc->id,
            null,
            ['entity_type' => $data['entity_type'], 'entity_id' => $data['entity_id']],
            'document_reader',
            false,
            $request,
            'Document Reader — rattachement à une entité',
        );

        return ApiResponse::success($this->serialize($doc->load('latestExtraction')));
    }

    public function preview(Request $request, string $id): StreamedResponse|JsonResponse
    {
        $doc = $this->find($request, $id);
        $disk = Storage::disk(config('filesystems.default', 'local'));
        if (! $disk->exists($doc->file_path)) {
            return ApiResponse::error('Fichier introuvable sur le disque.', 404);
        }

        return response()->streamDownload(function () use ($disk, $doc) {
            $stream = $disk->readStream($doc->file_path);
            if (is_resource($stream)) {
                fpassthru($stream);
                fclose($stream);
            }
        }, $doc->file_name, [
            'Content-Type' => $doc->mime_type ?: 'application/octet-stream',
            'Content-Disposition' => 'inline; filename="'.$doc->file_name.'"',
        ]);
    }

    /**
     * Une vignette du document, toujours en image — y compris pour un PDF, dont
     * on rend la première page. L'agent doit voir la pièce qu'il vient de
     * déposer, pas le nom de son fichier.
     */
    public function thumbnail(Request $request, string $id): StreamedResponse|JsonResponse
    {
        $doc = $this->find($request, $id);
        $disk = Storage::disk(config('filesystems.default', 'local'));
        if (! $disk->exists($doc->file_path)) {
            return ApiResponse::error('Fichier introuvable sur le disque.', 404);
        }

        $isPdf = str_contains((string) $doc->mime_type, 'pdf')
            || strtolower(pathinfo($doc->file_name, PATHINFO_EXTENSION)) === 'pdf';

        if (! $isPdf) {
            return response()->streamDownload(function () use ($disk, $doc) {
                $stream = $disk->readStream($doc->file_path);
                if (is_resource($stream)) {
                    fpassthru($stream);
                    fclose($stream);
                }
            }, $doc->file_name, [
                'Content-Type' => $doc->mime_type ?: 'image/jpeg',
                'Content-Disposition' => 'inline; filename="'.$doc->file_name.'"',
            ]);
        }

        // Le suffixe change avec le rendu : les vignettes d'une seule page
        // déjà en cache ne doivent pas masquer le document complet.
        $cachePath = 'reader-thumbnails/'.$doc->id.'-full.png';
        if (! $disk->exists($cachePath)) {
            $png = $this->renderPdfThumbnail($disk->path($doc->file_path));
            if ($png === null) {
                return ApiResponse::error('Aperçu indisponible pour ce PDF.', 415);
            }
            $disk->put($cachePath, file_get_contents($png));
            @unlink($png);
        }

        return response()->streamDownload(function () use ($disk, $cachePath) {
            $stream = $disk->readStream($cachePath);
            if (is_resource($stream)) {
                fpassthru($stream);
                fclose($stream);
            }
        }, $doc->id.'.png', [
            'Content-Type' => 'image/png',
            'Content-Disposition' => 'inline; filename="'.$doc->id.'.png"',
        ]);
    }

    /**
     * Le document entier en une image : une CIN scannée est un PDF recto/verso,
     * et n'en montrer que la première page revenait à cacher la moitié de la
     * pièce. Les pages sont empilées l'une sous l'autre. Null si poppler manque.
     */
    private function renderPdfThumbnail(string $absolutePath): ?string
    {
        $prefix = sys_get_temp_dir().DIRECTORY_SEPARATOR.'df_thumb_'.bin2hex(random_bytes(6));
        try {
            $process = new \Symfony\Component\Process\Process([
                (string) config('document_reader.tesseract.pdftoppm_bin', 'pdftoppm'),
                '-png', '-f', '1', '-l', '4', '-scale-to', '900',
                $absolutePath,
                $prefix,
            ]);
            $process->setTimeout(60);
            $process->mustRun();
        } catch (Throwable) {
            return null;
        }

        $pages = glob($prefix.'*.png') ?: [];
        sort($pages);
        if ($pages === []) {
            return null;
        }
        if (count($pages) === 1) {
            return $pages[0];
        }

        $merged = $prefix.'-all.png';
        try {
            $append = new \Symfony\Component\Process\Process(array_merge(
                [(string) config('document_reader.tesseract.convert_bin', 'convert')],
                $pages,
                ['-append', $merged],
            ));
            $append->setTimeout(60);
            $append->mustRun();
        } catch (Throwable) {
            // Sans ImageMagick on montre au moins le recto.
            return $pages[0];
        }

        foreach ($pages as $page) {
            @unlink($page);
        }

        return is_file($merged) ? $merged : $pages[0];
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $doc = $this->find($request, $id);
        $before = $doc->toArray();

        try {
            Storage::disk(config('filesystems.default', 'local'))->delete($doc->file_path);
        } catch (Throwable) {
            /* ignore — best-effort cleanup */
        }
        $doc->extractions()->delete();
        $doc->delete();

        AuditLogger::record(
            'reader_document_deleted',
            $request->user(),
            'reader_document',
            $before['id'],
            $before,
            null,
            'document_reader',
            false,
            $request,
            'Document Reader — document supprimé',
        );

        return ApiResponse::message('Document supprimé.');
    }

    private function find(Request $request, string $id): ReaderDocument
    {
        $user = $request->user();
        $query = ReaderDocument::query()->where('id', $id);
        if ($user?->company_id) {
            $query->where('company_id', $user->company_id);
        }

        return $query->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function serialize(ReaderDocument $doc, bool $withRawText = false): array
    {
        $extraction = $doc->relationLoaded('latestExtraction') ? $doc->latestExtraction : $doc->latestExtraction()->first();

        return [
            'id' => $doc->id,
            'file_name' => $doc->file_name,
            'mime_type' => $doc->mime_type,
            'file_size' => $doc->file_size,
            'document_type' => $doc->document_type,
            'status' => $doc->status,
            'error_message' => $doc->error_message,
            'linked_entity_type' => $doc->linked_entity_type,
            'linked_entity_id' => $doc->linked_entity_id,
            'created_by' => $doc->created_by,
            'created_at' => optional($doc->created_at)->toIso8601String(),
            'updated_at' => optional($doc->updated_at)->toIso8601String(),
            'extraction' => $extraction ? [
                'id' => $extraction->id,
                'provider' => $extraction->provider,
                'status' => $extraction->status,
                'confidence_score' => $extraction->confidence_score,
                'extracted_data' => $extraction->extracted_data,
                'validated_data' => $extraction->validated_data,
                'raw_text' => $withRawText ? $extraction->raw_text : null,
                'validated_at' => optional($extraction->validated_at)->toIso8601String(),
            ] : null,
        ];
    }
}
