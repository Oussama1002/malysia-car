<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\EntityAttachment;
use App\Models\GeneratedDocument;
use App\Services\AuditLogger;
use App\Services\DocumentService;
use App\Services\Documents\DocumentAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentCenterController extends Controller
{
    public function __construct(
        private readonly DocumentService $documents,
        private readonly DocumentAccessService $documentAccess,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = [
            'entity_type' => $request->query('entity_type'),
            'entity_id' => $request->query('entity_id'),
            'category' => $request->query('category'),
            'uploaded_by' => $request->query('uploaded_by'),
            'date_from' => $request->query('date_from'),
            'date_to' => $request->query('date_to'),
            'expiry_status' => $request->query('expiry_status'),
            'source' => $request->query('source', 'all'),
        ];
        $page = max(1, (int) $request->query('page', 1));
        $per = min(100, max(1, (int) $request->query('per_page', 50)));

        $paginator = $this->documents->listCentral($request->user(), $filters, $page, $per);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function expiring(Request $request): JsonResponse
    {
        $within = min(365, max(1, (int) $request->query('within_days', 30)));
        $rows = $this->documents->listExpiring($request->user(), $within);

        return ApiResponse::success([
            'withinDays' => $within,
            'items' => $rows->values()->all(),
        ]);
    }

    public function upload(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'max:15360'],
            'entity_type' => ['nullable', 'string', 'max:80'],
            'entity_id' => ['nullable', 'string', 'max:36'],
            'category' => ['nullable', 'string', 'max:80'],
            'title' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:500'],
            'visibility' => ['nullable', 'in:internal,restricted,client_visible'],
            'issue_date' => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
            'document_number' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', 'string', 'max:32'],
        ]);

        $user = $request->user();
        $file = $this->documents->storeUploadedFile($request->file('file'), $user, 'document-center');

        $attachment = null;
        if (! empty($data['entity_type']) && ! empty($data['entity_id'])) {
            $this->assertAllowedEntityType($data['entity_type']);
            $attachment = $this->documents->attachToEntity($file, $data['entity_type'], $data['entity_id'], [
                'category' => $data['category'] ?? 'general',
                'title' => $data['title'] ?? null,
                'notes' => $data['notes'] ?? null,
                'visibility' => $data['visibility'] ?? 'internal',
                'issue_date' => $data['issue_date'] ?? null,
                'expiry_date' => $data['expiry_date'] ?? null,
                'document_number' => $data['document_number'] ?? null,
                'status' => $data['status'] ?? 'active',
            ], $user);
            AuditLogger::created($attachment, $user, request: $request);
        } else {
            AuditLogger::record(
                'document_uploaded',
                $user,
                'file',
                $file->id,
                null,
                ['file_id' => $file->id],
                'documents',
                false,
                $request,
                'Fichier téléversé (sans rattachement)',
            );
        }

        return ApiResponse::success([
            'file' => $file,
            'attachment' => $attachment ? $this->documents->serializeAttachment($attachment) : null,
        ], null, null, 201);
    }

    public function entityIndex(Request $request, string $entityType, string $entityId): JsonResponse
    {
        $this->assertAllowedEntityType($entityType);
        $rows = $this->documents->listByEntity($entityType, $entityId, $request->user());
        $class = DocumentService::slugToModelClass($entityType);
        $generated = GeneratedDocument::query()
            ->when($request->user()->company_id, fn ($q, $cid) => $q->where('company_id', $cid))
            ->where('entity_id', $entityId)
            ->when($class, fn ($q) => $q->where('entity_type', $class))
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (GeneratedDocument $g) => $this->documents->serializeGenerated($g));

        return ApiResponse::success([
            'attachments' => $rows->values()->all(),
            'generated' => $generated->values()->all(),
        ]);
    }

    public function entityStore(Request $request, string $entityType, string $entityId): JsonResponse
    {
        $this->assertAllowedEntityType($entityType);
        $data = $request->validate([
            'file' => ['required', 'file', 'max:15360'],
            'category' => ['required', 'string', 'max:80'],
            'title' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:500'],
            'visibility' => ['nullable', 'in:internal,restricted,client_visible'],
            'issue_date' => ['nullable', 'date'],
            'expiry_date' => ['nullable', 'date'],
            'document_number' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', 'string', 'max:32'],
        ]);

        $user = $request->user();
        $file = $this->documents->storeUploadedFile($request->file('file'), $user, 'entities/'.$entityType);
        $attachment = $this->documents->attachToEntity($file, $entityType, $entityId, $data, $user);
        AuditLogger::created($attachment, $user, request: $request);

        return ApiResponse::success($this->documents->serializeAttachment($attachment), null, null, 201);
    }

    public function download(Request $request, string $document): StreamedResponse|JsonResponse
    {
        return $this->streamDocument($request, $document, 'download', inline: false);
    }

    public function preview(Request $request, string $document): StreamedResponse|JsonResponse
    {
        return $this->streamDocument($request, $document, 'preview', inline: true);
    }

    private function streamDocument(Request $request, string $document, string $action, bool $inline): StreamedResponse|JsonResponse
    {
        $result = $this->documentAccess->resolveStream($request->user(), $request, $document, $action);
        $disk = Storage::disk($result->disk);
        $stream = $disk->readStream($result->storagePath);
        if (! is_resource($stream)) {
            abort(404, 'Fichier introuvable sur le disque.');
        }

        $headers = [
            'Content-Type' => $result->mimeType,
            'X-Document-Sha256' => (string) ($result->sha256 ?? ''),
        ];
        if ($inline && (str_starts_with($result->mimeType, 'image/') || $result->mimeType === 'application/pdf')) {
            $headers['Content-Disposition'] = 'inline; filename="'.$result->downloadName.'"';
        }

        return response()->streamDownload(function () use ($stream) {
            fpassthru($stream);
            if (is_resource($stream)) {
                fclose($stream);
            }
        }, $result->downloadName, $headers);
    }

    public function destroy(Request $request, string $document): JsonResponse
    {
        $parsed = $this->documentAccess->parseDocumentRef($document);
        if ($parsed['kind'] === 'generated') {
            return ApiResponse::error('Les PDF générés ne sont pas supprimables depuis ce centre.', 422);
        }

        $this->documentAccess->resolveStream($request->user(), $request, $document, 'download');
        $user = $request->user();
        if ($user->role !== 'ADMIN' && ! (method_exists($user, 'hasPermission') && $user->hasPermission('documents.delete'))) {
            abort(403);
        }

        $attachment = EntityAttachment::query()->with('file')->findOrFail($parsed['id']);
        $before = $attachment->toArray();
        $this->documents->deleteAttachment($attachment, true);
        AuditLogger::record(
            'document_deleted',
            $user,
            'entity_attachment',
            (string) $before['id'],
            $before,
            null,
            'documents',
            false,
            $request,
            'Document supprimé',
        );

        return ApiResponse::message('Document supprimé.');
    }

    private function assertAllowedEntityType(string $entityType): void
    {
        if (! in_array($entityType, DocumentService::ENTITY_TYPES, true)) {
            abort(422, 'Type d\'entité non supporté.');
        }
    }
}
