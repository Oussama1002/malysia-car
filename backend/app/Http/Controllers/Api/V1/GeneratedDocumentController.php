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
        $contract = Contract::with([
            'customer.individualProfile',
            'customer.companyProfile',
            'customer.addresses',
            'vehicle.brand',
            'vehicle.model',
        ])->findOrFail($contractId);

        // The paper form has a second-driver block and a departure/return
        // check-list: both come from the reservation this contract was made for.
        $reservation = $contract->reservation_id
            ? \App\Models\Reservation::query()->find($contract->reservation_id)
            : null;
        $secondDriver = $reservation
            ? \App\Models\ReservationDriver::query()
                ->where('reservation_id', $reservation->id)
                ->where('driver_type', 'secondary')
                ->first()
            : null;
        $handovers = $reservation
            ? \App\Models\RentalHandoverReport::query()
                ->where('reservation_id', $reservation->id)
                ->orderBy('performed_at')
                ->get()
            : collect();

        // Par défaut, le PDF est fait pour être imprimé sur le formulaire
        // pré-imprimé de l'agence : seules les valeurs sont posées, aux
        // emplacements des blancs. `?layout=full` produit la version complète,
        // qui dessine le formulaire, pour une impression sur papier blanc.
        $overlay = $request->query('layout') !== 'full';

        $doc = $this->pdf->render(
            view: $overlay ? 'pdf.contract_overlay' : 'pdf.contract',
            data: [
                'f' => app(\App\Services\ContractFormFields::class)->forContract($contract),
                'contract' => $contract,
                'customer' => $contract->customer,
                'vehicle' => $contract->vehicle,
                'reservation' => $reservation,
                'secondDriver' => $secondDriver,
                'pickupReport' => $handovers->firstWhere('handover_type', 'pickup'),
                'returnReport' => $handovers->firstWhere('handover_type', 'return'),
                'settings' => data_get(
                    \App\Models\CompanySetting::query()->where('company_id', $contract->company_id)->value('payload'),
                    'company',
                    [],
                ),
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
