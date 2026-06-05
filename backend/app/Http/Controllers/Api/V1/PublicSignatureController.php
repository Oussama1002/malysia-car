<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Contract;
use App\Models\ContractSignature;
use App\Models\GeneratedDocument;
use App\Models\SignatureRequest;
use App\Services\AuditLogger;
use App\Services\PdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * PUBLIC, unauthenticated signing endpoints. Everything is keyed by the opaque
 * one-time token in the URL. We deliberately expose only a minimal, safe
 * contract summary — never internal ids, customer financials, notes or admin
 * data. The token is the single capability; it expires and is one-time-use.
 */
class PublicSignatureController extends Controller
{
    public function __construct(private readonly PdfService $pdf) {}

    /**
     * GET /public/signature/{token}
     * Returns the signer-facing contract summary + request status.
     */
    public function show(Request $request, string $token): JsonResponse
    {
        $sr = $this->findRequest($token);
        if (! $sr) {
            return ApiResponse::error('Lien de signature invalide.', 404);
        }

        // Lazily flip to expired so the signer sees an accurate state.
        if ($sr->status === SignatureRequest::STATUS_SENT && $sr->isExpired()) {
            $sr->forceFill(['status' => SignatureRequest::STATUS_EXPIRED])->save();
        }

        $contract = $this->resolveContract($sr->contract_id);
        if (! $contract) {
            return ApiResponse::error('Contrat introuvable.', 404);
        }

        return ApiResponse::success([
            'status' => $sr->status,
            'is_signable' => $sr->isSignable(),
            'is_expired' => $sr->isExpired(),
            'signer_name' => $sr->signer_name,
            'expires_at' => $sr->expires_at?->toIso8601String(),
            'signed_at' => $sr->signed_at?->toIso8601String(),
            'has_pdf' => $sr->document_id !== null,
            'contract' => $this->safeContractSummary($contract),
        ]);
    }

    /**
     * GET /public/signature/{token}/pdf
     * Streams the contract PDF inline for the signer to review.
     */
    public function pdf(Request $request, string $token): StreamedResponse|JsonResponse
    {
        $sr = $this->findRequest($token);
        if (! $sr || ! $sr->document_id) {
            return ApiResponse::error('Document introuvable.', 404);
        }

        $doc = GeneratedDocument::query()->find($sr->document_id);
        if (! $doc) {
            return ApiResponse::error('Document introuvable.', 404);
        }

        $stream = Storage::disk($doc->disk)->readStream($doc->storage_path);
        if (! is_resource($stream)) {
            return ApiResponse::error('Fichier introuvable.', 404);
        }

        return response()->streamDownload(function () use ($stream) {
            fpassthru($stream);
            if (is_resource($stream)) {
                fclose($stream);
            }
        }, 'contrat.pdf', [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="contrat.pdf"',
        ]);
    }

    /**
     * POST /public/signature/{token}/sign
     * Captures the drawn signature, stores it + a proof PDF, marks the request
     * signed (one-time) and flips the contract to signed.
     */
    public function sign(Request $request, string $token): JsonResponse
    {
        $data = $request->validate([
            'signer_name' => ['required', 'string', 'max:255'],
            // data URL: "data:image/png;base64,...."
            'signature_image' => ['required', 'string'],
            'accept' => ['accepted'],
        ]);

        $sr = $this->findRequest($token);
        if (! $sr) {
            return ApiResponse::error('Lien de signature invalide.', 404);
        }
        if ($sr->status === SignatureRequest::STATUS_SIGNED) {
            return ApiResponse::error('Ce contrat a déjà été signé.', 409);
        }
        if (! $sr->isSignable()) {
            // Expired or otherwise not in a signable state.
            if ($sr->isExpired()) {
                $sr->forceFill(['status' => SignatureRequest::STATUS_EXPIRED])->save();
            }

            return ApiResponse::error('Ce lien de signature n’est plus valide.', 410);
        }

        $binary = $this->decodeSignaturePng($data['signature_image']);
        if ($binary === null) {
            return ApiResponse::error('Signature invalide (image attendue).', 422);
        }

        $contract = $this->resolveContract($sr->contract_id);
        if (! $contract) {
            return ApiResponse::error('Contrat introuvable.', 404);
        }

        $disk = config('filesystems.default', 'local');
        $signaturePath = 'signatures/'.now()->format('Ymd').'/'.Str::uuid()->toString().'.png';
        Storage::disk($disk)->put($signaturePath, $binary);

        $signedAt = now();
        $dataUri = 'data:image/png;base64,'.base64_encode($binary);

        // Proof PDF: contract summary + the captured signature + legal metadata.
        $proof = $this->pdf->render(
            view: 'pdf.signature_proof',
            data: [
                'title' => 'Preuve de signature — '.($contract->contract_number ?? $contract->id),
                'contract' => $contract,
                'summary' => $this->safeContractSummary($contract),
                'signerName' => $data['signer_name'],
                'signatureDataUri' => $dataUri,
                'signedAt' => $signedAt,
                'ip' => $request->ip(),
                'userAgent' => (string) $request->userAgent(),
                'token' => substr($token, 0, 12).'…',
            ],
            documentType: 'signature_proof',
            title: 'Preuve de signature '.($contract->contract_number ?? $contract->id),
            entity: $contract,
            user: null,
        );

        $signature = ContractSignature::create([
            'company_id' => $sr->company_id,
            'signature_request_id' => $sr->id,
            'contract_id' => $sr->contract_id,
            'signer_name' => $data['signer_name'],
            'signature_disk' => $disk,
            'signature_path' => $signaturePath,
            'proof_document_id' => $proof->id,
            'signed_at' => $signedAt,
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 1024),
        ]);

        // One-time use: lock the request.
        $sr->forceFill([
            'status' => SignatureRequest::STATUS_SIGNED,
            'signed_at' => $signedAt,
            'signer_name' => $data['signer_name'],
        ])->save();

        // Reflect on the contract.
        $contract->forceFill([
            'signature_status' => SignatureRequest::STATUS_SIGNED,
            'signed_at' => $signedAt,
        ])->save();

        AuditLogger::legalAction(
            action: 'contract_signed',
            subject: $contract,
            user: null,
            request: $request,
            label: 'Contrat signé électroniquement',
            after: [
                'signature_request_id' => $sr->id,
                'contract_signature_id' => $signature->id,
                'signer_name' => $signature->signer_name,
                'signed_at' => $signedAt->toIso8601String(),
                'ip_address' => $request->ip(),
                'proof_document_id' => $proof->id,
            ],
        );

        return ApiResponse::message('Contrat signé avec succès.', 200, [
            'status' => SignatureRequest::STATUS_SIGNED,
            'signed_at' => $signedAt->toIso8601String(),
            'signer_name' => $signature->signer_name,
        ]);
    }

    /**
     * POST /public/signature/{token}/reject
     * Lets the signer decline. Marks the request + contract rejected.
     */
    public function reject(Request $request, string $token): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $sr = $this->findRequest($token);
        if (! $sr) {
            return ApiResponse::error('Lien de signature invalide.', 404);
        }
        if (! $sr->isSignable()) {
            return ApiResponse::error('Ce lien de signature n’est plus valide.', 410);
        }

        $sr->forceFill([
            'status' => SignatureRequest::STATUS_REJECTED,
            'rejected_at' => now(),
            'rejected_reason' => $data['reason'] ?? null,
        ])->save();

        $contract = $this->resolveContract($sr->contract_id);
        if ($contract) {
            $contract->forceFill(['signature_status' => SignatureRequest::STATUS_REJECTED])->save();
            AuditLogger::legalAction(
                action: 'contract_signature_rejected',
                subject: $contract,
                user: null,
                request: $request,
                label: 'Signature refusée par le client',
                after: ['signature_request_id' => $sr->id, 'reason' => $data['reason'] ?? null],
            );
        }

        return ApiResponse::message('Signature refusée.', 200, ['status' => SignatureRequest::STATUS_REJECTED]);
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private function findRequest(string $token): ?SignatureRequest
    {
        // Tokens are long and unguessable; a plain lookup is fine. No tenant
        // scope on SignatureRequest, so this works without an authenticated user.
        return SignatureRequest::query()->where('token', $token)->first();
    }

    /** Contract carries a tenant global scope; drop it for public access. */
    private function resolveContract(string $contractId): ?Contract
    {
        return Contract::withoutGlobalScope('tenant_scope')
            ->with(['vehicle'])
            ->find($contractId);
    }

    /**
     * Minimal, signer-safe view of the contract. No internal ids, no customer
     * financial profile, no notes, no admin metadata.
     *
     * @return array<string, mixed>
     */
    private function safeContractSummary(Contract $contract): array
    {
        $vehicle = $contract->vehicle;

        return [
            'contract_number' => $contract->contract_number,
            'contract_type' => $contract->contract_type,
            'start_date' => optional($contract->start_date)->toDateString(),
            'end_date' => optional($contract->end_date)->toDateString(),
            'duration_months' => $contract->duration_months,
            'currency_code' => $contract->currency_code,
            'base_amount' => $contract->base_amount,
            'monthly_payment' => $contract->monthly_payment,
            'deposit_amount' => $contract->deposit_amount,
            'vehicle' => $vehicle ? [
                'brand' => $vehicle->brand ?? null,
                'model' => $vehicle->model ?? null,
                'registration' => $vehicle->registration_number ?? null,
            ] : null,
        ];
    }

    /**
     * Decode a "data:image/png;base64,..." (or raw base64) payload to PNG bytes.
     * Returns null when the input isn't a plausible small image.
     */
    private function decodeSignaturePng(string $input): ?string
    {
        $raw = $input;
        if (str_contains($input, ',')) {
            [$meta, $raw] = explode(',', $input, 2);
            if (! str_contains($meta, 'image/')) {
                return null;
            }
        }

        $binary = base64_decode(strtr($raw, ' ', '+'), true);
        if ($binary === false || $binary === '') {
            return null;
        }
        // Guard against abuse: a drawn signature is small (~tens of KB).
        if (strlen($binary) > 2_000_000) {
            return null;
        }
        // Must be a real raster image.
        $info = @getimagesizefromstring($binary);
        if ($info === false) {
            return null;
        }

        return $binary;
    }
}
