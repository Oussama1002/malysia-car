<?php

namespace App\Services\Signature;

use App\Models\GeneratedDocument;
use App\Models\SignatureEnvelope;
use App\Models\SignatureSigner;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SignatureWorkflowService
{
    public function recordEnvelopeEvent(
        SignatureEnvelope $envelope,
        string $eventType,
        ?SignatureSigner $signer = null,
        array $data = [],
        ?Request $request = null,
        ?string $idempotencyKey = null,
    ): void {
        $event = $envelope->events()->create([
            'signer_id' => $signer?->id,
            'event_type' => $eventType,
            'idempotency_key' => $idempotencyKey,
            'event_data' => $data ?: null,
            'ip_address' => $request?->ip(),
            'occurred_at' => now(),
        ]);

        AuditLogger::legalAction(
            action: 'signature_'.$eventType,
            subject: $envelope,
            user: $request?->user(),
            request: $request,
            label: 'Signature: '.$eventType,
            after: [
                'event_id' => $event->id,
                'signer_id' => $signer?->id,
                'data' => $data,
            ],
            module: 'signature',
        );
    }

    /**
     * Finalize envelope: attach provider-delivered files when present, otherwise
     * derive a signed PDF copy from the source generated document (internal flow).
     *
     * @param  array{signed_file_id?: ?string, certificate_file_id?: ?string, proof_metadata?: ?array}  $providerPayload
     */
    public function completeEnvelope(SignatureEnvelope $envelope, ?Request $request = null, array $providerPayload = []): void
    {
        $envelope->refresh();

        if ($envelope->signed_file_id) {
            return;
        }

        $signedFromProvider = $providerPayload['signed_file_id'] ?? null;
        if (is_string($signedFromProvider) && $signedFromProvider !== '') {
            $signedDoc = GeneratedDocument::find($signedFromProvider);
            if ($signedDoc && Storage::disk($signedDoc->disk)->exists($signedDoc->storage_path)) {
                $proof = array_merge(
                    is_array($envelope->proof_metadata) ? $envelope->proof_metadata : [],
                    is_array($providerPayload['proof_metadata'] ?? null) ? $providerPayload['proof_metadata'] : [],
                    [
                        'provider' => $envelope->provider,
                        'completed_at' => now()->toIso8601String(),
                        'provider_envelope_id' => $envelope->provider_envelope_id,
                    ]
                );
                $certId = $providerPayload['certificate_file_id'] ?? null;
                $certDoc = is_string($certId) && $certId !== '' ? GeneratedDocument::find($certId) : null;

                $envelope->update([
                    'signed_file_id' => $signedDoc->id,
                    'signed_document_path' => $signedDoc->storage_path,
                    'certificate_file_id' => $certDoc?->id,
                    'proof_metadata' => $proof,
                ]);

                return;
            }
        }

        if (! $envelope->source_file_id) {
            return;
        }

        $source = GeneratedDocument::find($envelope->source_file_id);
        if (! $source) {
            return;
        }

        $disk = Storage::disk($source->disk);
        if (! $disk->exists($source->storage_path)) {
            return;
        }

        $raw = (string) $disk->get($source->storage_path);
        $signedPath = preg_replace('/\.pdf$/i', '', $source->storage_path).'-signed.pdf';
        $disk->put($signedPath, $raw);

        $signedDoc = GeneratedDocument::create([
            'company_id' => $source->company_id,
            'generated_by_user_id' => $request?->user()?->id ?? $source->generated_by_user_id,
            'document_type' => 'signed_contract',
            'entity_type' => $source->entity_type,
            'entity_id' => $source->entity_id,
            'title' => $source->title.' (signed)',
            'disk' => $source->disk,
            'storage_path' => $signedPath,
            'mime_type' => 'application/pdf',
            'size_bytes' => strlen($raw),
            'sha256' => hash('sha256', $raw),
            'metadata' => [
                'signature_envelope_id' => $envelope->id,
                'provider' => $envelope->provider,
            ],
        ]);

        $proofPayload = [
            'provider' => $envelope->provider,
            'completed_at' => now()->toIso8601String(),
            'provider_envelope_id' => $envelope->provider_envelope_id,
        ];
        $certificatePath = preg_replace('/\.pdf$/i', '', $source->storage_path).'-certificate.json';
        $disk->put($certificatePath, json_encode($proofPayload, JSON_PRETTY_PRINT));
        $certificateRaw = (string) $disk->get($certificatePath);

        $certificateDoc = GeneratedDocument::create([
            'company_id' => $source->company_id,
            'generated_by_user_id' => $request?->user()?->id ?? $source->generated_by_user_id,
            'document_type' => 'signature_certificate',
            'entity_type' => $source->entity_type,
            'entity_id' => $source->entity_id,
            'title' => $source->title.' (certificate)',
            'disk' => $source->disk,
            'storage_path' => $certificatePath,
            'mime_type' => 'application/json',
            'size_bytes' => strlen($certificateRaw),
            'sha256' => hash('sha256', $certificateRaw),
            'metadata' => [
                'signature_envelope_id' => $envelope->id,
                'provider' => $envelope->provider,
            ],
        ]);

        $envelope->update([
            'signed_file_id' => $signedDoc->id,
            'signed_document_path' => $signedDoc->storage_path,
            'certificate_file_id' => $certificateDoc->id,
            'proof_metadata' => $proofPayload,
        ]);
    }
}
