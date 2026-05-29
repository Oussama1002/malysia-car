<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Contract;
use App\Models\SignatureRequest;
use App\Services\AuditLogger;
use App\Services\PdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Authenticated side of the e-signature module: create and list signature
 * requests for a contract. The actual signing happens on the public,
 * tokenized endpoints (see PublicSignatureController).
 */
class ContractSignatureRequestController extends Controller
{
    public function __construct(private readonly PdfService $pdf) {}

    /**
     * GET /contracts/{contract}/signature-requests
     * Returns the contract's signature requests (most recent first) so the
     * detail page can show the current status.
     */
    public function index(Request $request, Contract $contract): JsonResponse
    {
        $rows = SignatureRequest::query()
            ->where('contract_id', $contract->id)
            ->with('signature')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (SignatureRequest $r) => $this->serialize($r));

        return ApiResponse::success($rows);
    }

    /**
     * POST /contracts/{contract}/signature-requests
     * Creates a tokenized signing link. Generates a fresh contract PDF for the
     * signer to review, sets the contract to sent_for_signature and returns the
     * public signing URL.
     */
    public function store(Request $request, Contract $contract): JsonResponse
    {
        $data = $request->validate([
            'signer_name' => ['nullable', 'string', 'max:255'],
            'signer_email' => ['nullable', 'email', 'max:255'],
            'signer_phone' => ['nullable', 'string', 'max:40'],
            'expires_in_days' => ['nullable', 'integer', 'min:1', 'max:90'],
        ]);

        // Invalidate any previous still-pending request for this contract so a
        // contract only ever has one live signing link at a time.
        SignatureRequest::query()
            ->where('contract_id', $contract->id)
            ->where('status', SignatureRequest::STATUS_SENT)
            ->update([
                'status' => SignatureRequest::STATUS_EXPIRED,
                'rejected_reason' => 'Remplacé par une nouvelle demande de signature.',
            ]);

        // Default signer name from the contract's customer when not provided.
        $contract->loadMissing(['customer.individualProfile', 'customer.companyProfile']);
        $signerName = $data['signer_name']
            ?? ($contract->customer ? $contract->customer->displayName() : null);

        // Generate a fresh PDF the signer will review.
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

        $expiresInDays = (int) ($data['expires_in_days'] ?? 7);

        $sr = SignatureRequest::create([
            'company_id' => $contract->company_id,
            'contract_id' => $contract->id,
            'status' => SignatureRequest::STATUS_SENT,
            'signer_name' => $signerName,
            'signer_email' => $data['signer_email'] ?? null,
            'signer_phone' => $data['signer_phone'] ?? null,
            'document_id' => $doc->id,
            'expires_at' => now()->addDays($expiresInDays),
            'sent_at' => now(),
            'created_by' => $request->user()?->id,
        ]);

        $contract->forceFill(['signature_status' => SignatureRequest::STATUS_SENT])->save();

        AuditLogger::legalAction(
            action: 'signature_request_created',
            subject: $contract,
            user: $request->user(),
            request: $request,
            label: 'Demande de signature envoyée',
            after: [
                'signature_request_id' => $sr->id,
                'expires_at' => $sr->expires_at?->toIso8601String(),
                'signer_name' => $sr->signer_name,
            ],
        );

        return ApiResponse::success($this->serialize($sr->fresh('signature')), status: 201);
    }

    /** Build the public signer-facing URL for a token. */
    private function signingUrl(string $token): string
    {
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return $base.'/sign/'.$token;
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(SignatureRequest $r): array
    {
        $signature = $r->signature;

        return [
            'id' => $r->id,
            'contract_id' => $r->contract_id,
            'status' => $r->status,
            'signer_name' => $r->signer_name,
            'signer_email' => $r->signer_email,
            'signer_phone' => $r->signer_phone,
            'expires_at' => $r->expires_at?->toIso8601String(),
            'sent_at' => $r->sent_at?->toIso8601String(),
            'signed_at' => $r->signed_at?->toIso8601String(),
            'rejected_at' => $r->rejected_at?->toIso8601String(),
            'rejected_reason' => $r->rejected_reason,
            'is_expired' => $r->isExpired(),
            // Only expose the live link while it can still be used.
            'signing_url' => $r->isSignable() ? $this->signingUrl($r->token) : null,
            'signature' => $signature ? [
                'id' => $signature->id,
                'signer_name' => $signature->signer_name,
                'signed_at' => $signature->signed_at?->toIso8601String(),
                'ip_address' => $signature->ip_address,
                'proof_document_id' => $signature->proof_document_id,
            ] : null,
            'created_at' => $r->created_at?->toIso8601String(),
        ];
    }
}
