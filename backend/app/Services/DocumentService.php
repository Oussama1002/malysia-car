<?php

namespace App\Services;

use App\Domain\Documents\DocumentClassification;
use App\Models\EntityAttachment;
use App\Models\File;
use App\Models\CreditApplication;
use App\Models\GeneratedDocument;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Pagination\LengthAwarePaginator as PaginatorConcrete;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DocumentService
{
    public const ENTITY_TYPES = [
        'vehicle', 'customer', 'contract', 'accident', 'mission', 'kyc_case', 'invoice', 'credit_application',
    ];

    public function generateChecksum(string $absolutePath): string
    {
        $hash = hash_file('sha256', $absolutePath);

        return $hash !== false ? $hash : '';
    }

    /**
     * Store binary on disk and persist `files` row.
     */
    public function storeUploadedFile(UploadedFile $uploadedFile, User $user, string $subfolder = 'uploads'): File
    {
        $disk = config('filesystems.default', 'local');
        $companyId = $user->company_id ?? '00000000-0000-0000-0000-000000000001';
        $ext = $uploadedFile->getClientOriginalExtension() ?: 'bin';
        $stored = Str::uuid()->toString().'.'.$ext;
        $path = trim($subfolder.'/'.$companyId, '/').'/'.$stored;
        $full = $uploadedFile->storeAs(dirname($path), basename($path), $disk);
        $abs = Storage::disk($disk)->path($full);
        $checksum = is_file($abs) ? $this->generateChecksum($abs) : null;

        return File::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'branch_id' => $user->branch_id ?? null,
            'original_name' => $uploadedFile->getClientOriginalName(),
            'stored_name' => basename($full),
            'storage_disk' => $disk,
            'storage_path' => $full,
            'mime_type' => $uploadedFile->getClientMimeType() ?: 'application/octet-stream',
            'extension' => $ext,
            'file_size' => (int) $uploadedFile->getSize(),
            'checksum_sha256' => $checksum,
            'uploaded_by' => $user->id,
            'is_public' => false,
            'created_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    public function attachToEntity(File $file, string $entityType, string $entityId, array $meta, ?User $user): EntityAttachment
    {
        $attachment = EntityAttachment::query()->create([
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'file_id' => $file->id,
            'category' => (string) ($meta['category'] ?? 'general'),
            'title' => $meta['title'] ?? $file->original_name,
            'notes' => $meta['notes'] ?? null,
            'visibility' => (string) ($meta['visibility'] ?? 'internal'),
            'uploaded_by' => $user?->id,
            'issue_date' => $meta['issue_date'] ?? null,
            'expiry_date' => $meta['expiry_date'] ?? null,
            'document_number' => $meta['document_number'] ?? null,
            'status' => (string) ($meta['status'] ?? 'active'),
        ]);

        return $attachment->load('file');
    }

    public function deleteAttachment(EntityAttachment $attachment, bool $deleteFileIfOrphan = true): void
    {
        $fileId = $attachment->file_id;
        $attachment->delete();

        if (! $deleteFileIfOrphan) {
            return;
        }

        $remaining = EntityAttachment::query()->where('file_id', $fileId)->count();
        if ($remaining === 0) {
            $this->deleteFile(File::query()->find($fileId));
        }
    }

    public function deleteFile(?File $file): void
    {
        if (! $file) {
            return;
        }
        try {
            Storage::disk($file->storage_disk)->delete($file->storage_path);
        } catch (\Throwable) {
            /* ignore */
        }
        $file->delete();
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function listByEntity(string $entityType, string $entityId, ?User $user): Collection
    {
        $companyId = $user?->company_id;

        $rows = EntityAttachment::query()
            ->with(['file', 'uploader'])
            ->where('entity_type', $entityType)
            ->where('entity_id', $entityId)
            ->whereHas('file', function ($q) use ($companyId): void {
                if ($companyId) {
                    $q->where('company_id', $companyId);
                }
            })
            ->orderByDesc('id')
            ->get();

        return $rows->map(fn (EntityAttachment $a) => $this->serializeAttachment($a));
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function listExpiring(?User $user, int $withinDays = 30): Collection
    {
        $until = now()->addDays($withinDays)->toDateString();
        $companyId = $user?->company_id;

        $q = EntityAttachment::query()
            ->with(['file', 'uploader'])
            ->whereNotNull('expiry_date')
            ->where('expiry_date', '<=', $until)
            ->where('status', 'active')
            ->whereHas('file', function ($q) use ($companyId): void {
                if ($companyId) {
                    $q->where('company_id', $companyId);
                }
            })
            ->orderBy('expiry_date');

        return $q->get()->map(fn (EntityAttachment $a) => $this->serializeAttachment($a));
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function listCentral(User $user, array $filters, int $page, int $perPage): LengthAwarePaginator
    {
        $companyId = $user->company_id;
        $attachmentQuery = EntityAttachment::query()
            ->with(['file', 'uploader'])
            ->whereHas('file', function ($q) use ($companyId): void {
                if ($companyId) {
                    $q->where('company_id', $companyId);
                }
            });

        if (! empty($filters['entity_type'])) {
            $attachmentQuery->where('entity_type', $filters['entity_type']);
        }
        if (! empty($filters['entity_id'])) {
            $attachmentQuery->where('entity_id', $filters['entity_id']);
        }
        if (! empty($filters['category'])) {
            $attachmentQuery->where('category', $filters['category']);
        }
        if (! empty($filters['uploaded_by'])) {
            $attachmentQuery->where('uploaded_by', $filters['uploaded_by']);
        }
        if (! empty($filters['date_from'])) {
            $attachmentQuery->whereDate('entity_attachments.created_at', '>=', $filters['date_from']);
        }
        if (! empty($filters['date_to'])) {
            $attachmentQuery->whereDate('entity_attachments.created_at', '<=', $filters['date_to']);
        }

        $genQuery = GeneratedDocument::query()->orderByDesc('created_at');
        if ($companyId) {
            $genQuery->where('company_id', $companyId);
        }
        if (! empty($filters['entity_type'])) {
            $slug = $filters['entity_type'];
            $class = self::slugToModelClass($slug);
            if ($class) {
                $genQuery->where('entity_type', $class);
            }
        }
        if (! empty($filters['entity_id'])) {
            $genQuery->where('entity_id', $filters['entity_id']);
        }
        if (! empty($filters['date_from'])) {
            $genQuery->whereDate('created_at', '>=', $filters['date_from']);
        }
        if (! empty($filters['date_to'])) {
            $genQuery->whereDate('created_at', '<=', $filters['date_to']);
        }

        $includeUploaded = ($filters['source'] ?? 'all') !== 'generated';
        $includeGenerated = ($filters['source'] ?? 'all') !== 'upload';

        $attachments = $includeUploaded
            ? $attachmentQuery->orderByDesc('entity_attachments.id')->get()->map(fn (EntityAttachment $a) => $this->serializeAttachment($a, true))
            : collect();
        $generated = $includeGenerated
            ? $genQuery->get()->map(fn (GeneratedDocument $g) => $this->serializeGenerated($g))
            : collect();

        $merged = $attachments->concat($generated)->sortByDesc(function ($r) {
            $t = $r['createdAt'] ?? null;

            return $t ? strtotime((string) $t) : 0;
        })->values();

        if (! empty($filters['expiry_status']) && ($filters['expiry_status'] ?? 'all') !== 'all') {
            $bucket = match ($filters['expiry_status']) {
                'expiring_30' => 'expiring_soon',
                default => $filters['expiry_status'],
            };
            $merged = $merged->filter(fn ($r) => ($r['expiryBucket'] ?? '') === $bucket)->values();
        }

        $total = $merged->count();
        $slice = $merged->forPage($page, $perPage)->values();

        return new PaginatorConcrete(
            $slice->all(),
            $total,
            $perPage,
            $page,
            ['path' => request()->url(), 'query' => request()->query()]
        );
    }

    public static function slugToModelClass(string $slug): ?string
    {
        return match ($slug) {
            'vehicle' => \App\Models\Vehicle::class,
            'customer' => \App\Models\Customer::class,
            'contract' => \App\Models\Contract::class,
            'accident' => \App\Models\VehicleAccident::class,
            'mission' => \App\Models\Mission::class,
            'kyc_case' => \App\Models\CustomerKycCase::class,
            'invoice' => Invoice::class,
            'credit_application' => CreditApplication::class,
            default => null,
        };
    }

    public static function modelClassToSlug(?string $class): ?string
    {
        if (! $class) {
            return null;
        }

        return match ($class) {
            \App\Models\Vehicle::class => 'vehicle',
            \App\Models\Customer::class => 'customer',
            \App\Models\Contract::class => 'contract',
            \App\Models\VehicleAccident::class => 'accident',
            \App\Models\Mission::class => 'mission',
            \App\Models\CustomerKycCase::class => 'kyc_case',
            Invoice::class => 'invoice',
            CreditApplication::class => 'credit_application',
            default => null,
        };
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeAttachment(EntityAttachment $a, bool $forCentral = false): array
    {
        $f = $a->file;
        $base = [
            'id' => $a->publicId(),
            'source' => 'upload',
            'title' => $a->title ?? $f?->original_name,
            'category' => $a->category,
            'entityType' => $a->entity_type,
            'entityId' => $a->entity_id,
            'mimeType' => $f?->mime_type,
            'sizeBytes' => $f?->file_size,
            'checksum' => $f?->checksum_sha256,
            'expiryDate' => $a->expiry_date?->toDateString(),
            'issueDate' => $a->issue_date?->toDateString(),
            'documentNumber' => $a->document_number,
            'visibility' => $a->visibility,
            'status' => $a->status,
            'uploadedBy' => $a->uploader ? ['id' => $a->uploader->id, 'name' => $a->uploader->name] : null,
            'createdAt' => $a->created_at?->toIso8601String(),
            'notes' => $a->notes,
        ];
        if ($forCentral) {
            $base['expiryBucket'] = $this->expiryBucket($a->expiry_date);
        }
        $base['classification'] = DocumentClassification::forAttachment(
            $a->classification,
            (string) $a->entity_type,
            (string) $a->category,
        );

        return $base;
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeGenerated(GeneratedDocument $g): array
    {
        return [
            'id' => 'gen-'.$g->id,
            'source' => 'generated',
            'title' => $g->title,
            'category' => $g->document_type,
            'entityType' => self::modelClassToSlug($g->entity_type) ?? $g->entity_type,
            'entityId' => $g->entity_id,
            'mimeType' => $g->mime_type,
            'sizeBytes' => $g->size_bytes,
            'checksum' => $g->sha256,
            'expiryDate' => null,
            'issueDate' => null,
            'documentNumber' => null,
            'visibility' => 'internal',
            'status' => 'active',
            'uploadedBy' => $g->generated_by_user_id ? ['id' => $g->generated_by_user_id] : null,
            'createdAt' => $g->created_at?->toIso8601String(),
            'notes' => null,
            'expiryBucket' => 'none',
            'classification' => DocumentClassification::forGenerated($g->classification, (string) $g->document_type),
        ];
    }

    private function expiryBucket(?\Illuminate\Support\Carbon $expiry): string
    {
        if (! $expiry) {
            return 'missing';
        }
        if ($expiry->isPast()) {
            return 'expired';
        }
        if ($expiry->lte(now()->addDays(30))) {
            return 'expiring_soon';
        }

        return 'ok';
    }

}
