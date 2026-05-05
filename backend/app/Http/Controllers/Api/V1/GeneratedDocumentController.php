<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Contract;
use App\Models\GeneratedDocument;
use App\Models\Invoice;
use App\Services\AuditLogger;
use App\Services\Documents\DocumentAccessService;
use App\Services\PdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class GeneratedDocumentController extends Controller
{
    public function __construct(
        private readonly PdfService $pdf,
        private readonly DocumentAccessService $documentAccess,
    ) {}

    public function show(Request $request, string $id): JsonResponse
    {
        $doc = GeneratedDocument::query()->findOrFail($id);
        $this->documentAccess->assertCanViewGeneratedMetadata($request->user(), $request, $doc);

        return ApiResponse::success($this->safeGeneratedPayload($doc));
    }

    public function download(Request $request, string $id): StreamedResponse
    {
        $ref = str_starts_with($id, 'gen-') ? $id : 'gen-'.$id;
        $result = $this->documentAccess->resolveStream($request->user(), $request, $ref, 'download');
        $disk = Storage::disk($result->disk);
        $stream = $disk->readStream($result->storagePath);
        if (! is_resource($stream)) {
            abort(404, 'Fichier introuvable sur le disque.');
        }

        return response()->streamDownload(function () use ($stream) {
            fpassthru($stream);
            if (is_resource($stream)) {
                fclose($stream);
            }
        }, $result->downloadName, [
            'Content-Type' => $result->mimeType,
            'X-Document-Sha256' => (string) ($result->sha256 ?? ''),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function safeGeneratedPayload(GeneratedDocument $doc): array
    {
        return [
            'id' => $doc->id,
            'document_ref' => 'gen-'.$doc->id,
            'company_id' => $doc->company_id,
            'generated_by_user_id' => $doc->generated_by_user_id,
            'document_type' => $doc->document_type,
            'classification' => $doc->classification,
            'entity_type' => $doc->entity_type,
            'entity_id' => $doc->entity_id,
            'title' => $doc->title,
            'mime_type' => $doc->mime_type,
            'size_bytes' => $doc->size_bytes,
            'sha256' => $doc->sha256,
            'metadata' => $doc->metadata,
            'created_at' => $doc->created_at?->toIso8601String(),
            'updated_at' => $doc->updated_at?->toIso8601String(),
        ];
    }

    public function generateContract(Request $request, string $contractId): JsonResponse
    {
        $contract = Contract::with(['customer', 'vehicle'])->findOrFail($contractId);

        $doc = $this->pdf->render(
            view: 'pdf.contract',
            data: [
                'contract' => $contract,
                'customer' => $contract->customer,
                'vehicle' => $contract->vehicle,
                'company' => null,
                'title' => 'Contrat '.($contract->contract_number ?? $contract->id),
                'documentRef' => 'CT-'.($contract->contract_number ?? substr($contract->id, 0, 8)),
            ],
            documentType: 'contract',
            title: 'Contrat '.($contract->contract_number ?? $contract->id),
            entity: $contract,
            user: $request->user(),
        );

        AuditLogger::record(
            action: 'pdf_generated',
            user: $request->user(),
            entityType: $doc->entity_type,
            entityId: $doc->entity_id,
            module: 'documents',
            request: $request,
            label: 'PDF généré',
            after: ['document_id' => $doc->id, 'sha256' => $doc->sha256],
        );

        return ApiResponse::success($this->safeGeneratedPayload($doc), status: 201);
    }

    public function generateInvoice(Request $request, string $invoiceId): JsonResponse
    {
        $invoice = Invoice::with(['customer', 'lines'])->findOrFail($invoiceId);

        $doc = $this->pdf->render(
            view: 'pdf.invoice',
            data: [
                'invoice' => $invoice,
                'customer' => $invoice->customer,
                'lines' => $invoice->lines,
                'company' => null,
                'title' => 'Facture '.($invoice->invoice_number ?? $invoice->id),
                'documentRef' => 'INV-'.($invoice->invoice_number ?? substr($invoice->id, 0, 8)),
            ],
            documentType: 'invoice',
            title: 'Facture '.($invoice->invoice_number ?? $invoice->id),
            entity: $invoice,
            user: $request->user(),
        );

        AuditLogger::record(
            action: 'pdf_generated',
            user: $request->user(),
            entityType: $doc->entity_type,
            entityId: $doc->entity_id,
            module: 'documents',
            request: $request,
            label: 'PDF généré',
            after: ['document_id' => $doc->id, 'sha256' => $doc->sha256],
        );

        return ApiResponse::success($this->safeGeneratedPayload($doc), status: 201);
    }
}
