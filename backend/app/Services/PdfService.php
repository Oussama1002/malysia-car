<?php

namespace App\Services;

use App\Models\GeneratedDocument;
use App\Models\User;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PdfService
{
    /**
     * Render a Blade view to PDF, persist it on the configured disk and
     * record the file in `generated_documents`. Returns the GeneratedDocument.
     *
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $metadata
     */
    public function render(
        string $view,
        array $data,
        string $documentType,
        string $title,
        ?Model $entity = null,
        ?User $user = null,
        ?string $disk = null,
        array $metadata = [],
    ): GeneratedDocument {
        $disk ??= config('filesystems.default', 'local');

        $pdf = Pdf::loadView($view, $data);
        $binary = $pdf->output();

        $sha256 = hash('sha256', $binary);
        $companyId = $user?->company_id ?? ($entity?->company_id ?? null);

        $folder = trim('documents/'.$documentType, '/');
        $filename = sprintf('%s/%s-%s.pdf', $folder, now()->format('Ymd-His'), Str::random(8));

        Storage::disk($disk)->put($filename, $binary);

        return GeneratedDocument::create([
            'company_id' => $companyId,
            'generated_by_user_id' => $user?->id,
            'document_type' => $documentType,
            'entity_type' => $entity ? $entity::class : null,
            'entity_id' => $entity?->getKey(),
            'title' => $title,
            'disk' => $disk,
            'storage_path' => $filename,
            'mime_type' => 'application/pdf',
            'size_bytes' => strlen($binary),
            'sha256' => $sha256,
            'metadata' => $metadata,
        ]);
    }

    public function streamBinary(GeneratedDocument $doc): string
    {
        return Storage::disk($doc->disk)->get($doc->storage_path);
    }
}
