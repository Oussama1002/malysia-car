<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GeneratedDocument;
use App\Models\SignatureEnvelope;
use App\Notifications\NotificationCategory;
use App\Services\AuditLogger;
use App\Services\Documents\DocumentAccessService;
use App\Services\NotificationService;
use App\Services\Signature\SignatureProviderManager;
use App\Services\Signature\SignatureWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Illuminate\Support\Facades\Storage;

class SignatureEnvelopeController extends Controller
{
    public function __construct(
        private readonly SignatureProviderManager $providerManager,
        private readonly SignatureWorkflowService $workflowService,
        private readonly NotificationService $notifications,
        private readonly DocumentAccessService $documentAccess,
    ) {}

    // ── GET /signatures/envelopes ─────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $q = SignatureEnvelope::with(['signers', 'signable'])
            ->when($request->status, fn($b) => $b->where('status', $request->status))
            ->when($request->provider, fn($b) => $b->where('provider', $request->provider))
            ->when($request->signable_type, fn($b) => $b->where('signable_type', $request->signable_type))
            ->when($request->signable_id, fn($b) => $b->where('signable_id', $request->signable_id))
            ->when($request->search, function ($b) use ($request) {
                $b->where('subject', 'like', "%{$request->search}%");
            })
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return ApiResponse::paginated($q);
    }

    // ── POST /signatures/envelopes ────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject'        => 'required|string|max:255',
            'message'        => 'nullable|string|max:2000',
            'provider'       => 'nullable|string|in:internal,docusign,yousign,adobe',
            'signable_type'  => 'nullable|string|max:100',
            'signable_id'    => 'nullable|uuid',
            'source_file_id' => 'nullable|uuid|exists:generated_documents,id',
            'document_path'  => 'nullable|string|max:500',
            'expires_at'     => 'nullable|date',
            'signers'        => 'required|array|min:1',
            'signers.*.name'         => 'required|string|max:100',
            'signers.*.email'        => 'required|email|max:150',
            'signers.*.phone'        => 'nullable|string|max:30',
            'signers.*.role'         => 'nullable|string|in:client,guarantor,company_rep,witness,notary',
            'signers.*.signer_order' => 'nullable|integer|min:1',
        ]);

        $envelope = DB::transaction(function () use ($data, $request) {
            $provider = $data['provider'] ?? (string) config('signature.default_provider', 'yousign');
            if (!$this->providerManager->canUseInternalProvider($provider)) {
                abort(422, 'Le provider internal OTP est réservé aux environnements de développement (ou activez SIGNATURE_ALLOW_INTERNAL_OUTSIDE_DEV).');
            }
            $sourceFileId = $data['source_file_id'] ?? $this->resolveSourceFileId(
                signableType: $data['signable_type'] ?? null,
                signableId: $data['signable_id'] ?? null,
            );

            $env = SignatureEnvelope::create([
                'subject'             => $data['subject'],
                'message'             => $data['message'] ?? null,
                'provider'            => $provider,
                'signable_type'       => $data['signable_type'] ?? null,
                'signable_id'         => $data['signable_id'] ?? null,
                'source_file_id'      => $sourceFileId,
                'document_path'       => $data['document_path'] ?? null,
                'expires_at'          => $data['expires_at'] ?? null,
                'created_by_user_id'  => $request->user()?->id,
                'status'              => 'draft',
                'metadata'            => [
                    'provider_mode' => $provider === 'internal' ? 'demo' : 'external',
                    'provider_configured' => $provider !== 'internal',
                ],
            ]);

            foreach ($data['signers'] as $i => $s) {
                $env->signers()->create([
                    'signer_order' => $s['signer_order'] ?? ($i + 1),
                    'name'         => $s['name'],
                    'email'        => $s['email'],
                    'phone'        => $s['phone'] ?? null,
                    'role'         => $s['role'] ?? 'client',
                    'status'       => 'pending',
                ]);
            }

            $this->workflowService->recordEnvelopeEvent($env, 'envelope_created', null, ['subject' => $env->subject], $request);

            return $env->load(['signers', 'events']);
        });

        return ApiResponse::success($envelope, 201);
    }

    // ── GET /signatures/envelopes/{id} ────────────────────────────────────

    public function show(string $id): JsonResponse
    {
        $envelope = SignatureEnvelope::with(['signers', 'events.signer', 'signable', 'sourceFile', 'signedFile', 'certificateFile'])
            ->findOrFail($id);

        return ApiResponse::success($envelope);
    }

    // ── POST /signatures/envelopes/{id}/send ─────────────────────────────

    public function send(Request $request, string $id): JsonResponse
    {
        $envelope = SignatureEnvelope::with(['signers', 'sourceFile'])->findOrFail($id);

        if (!in_array($envelope->status, ['draft', 'in_progress'])) {
            return ApiResponse::error("L'enveloppe ne peut pas être envoyée dans son statut actuel ({$envelope->status}).", 422);
        }
        if (!$envelope->signers()->exists()) {
            return ApiResponse::error("Ajoutez au moins un signataire avant d'envoyer.", 422);
        }
        if (!$this->providerManager->canUseInternalProvider($envelope->provider)) {
            return ApiResponse::error('Ce fournisseur de signature n’est pas autorisé dans cet environnement.', 422);
        }
        if (!$this->envelopeHasAccessiblePdf($envelope)) {
            return ApiResponse::error(
                'Un document PDF source est obligatoire : renseignez source_file_id (document généré) ou un document_path existant sur le disque configuré.',
                422
            );
        }

        DB::transaction(function () use ($envelope, $request) {
            $provider = $this->providerManager->resolve($envelope->provider);
            $providerData = $provider->sendEnvelope($envelope);

            $envelope->update([
                'status'  => 'sent',
                'sent_at' => now(),
                'metadata' => array_merge($envelope->metadata ?? [], ['provider_data' => $providerData]),
            ]);

            $this->workflowService->recordEnvelopeEvent($envelope, 'sent', null, ['provider' => $envelope->provider], $request);

            if ($envelope->provider === 'internal') {
                $firstSigner = $envelope->signers()->where('status', 'sent')->orderBy('signer_order')->first();
                if ($firstSigner) {
                    $this->workflowService->recordEnvelopeEvent($envelope, 'otp_sent', $firstSigner, ['email' => $firstSigner->email], $request);
                }
            }
        });

        AuditLogger::legalAction(
            action: 'envelope_sent',
            subject: $envelope,
            user: $request->user(),
            request: $request,
            label: 'Envoi signature',
        );
        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'DIRECTEUR', 'ADMIN'],
            category: 'signature.sent',
            title: 'Signature envoyee',
            body: 'Enveloppe "'.$envelope->subject.'" envoyee aux signataires.',
            module: 'signatures',
            priority: 'normal',
            entity: $envelope,
            linkUrl: '/signatures/'.$envelope->id,
        );

        return ApiResponse::success($envelope->fresh(['signers', 'events']));
    }

    // ── POST /signatures/envelopes/{id}/void ─────────────────────────────

    public function void(Request $request, string $id): JsonResponse
    {
        $envelope = SignatureEnvelope::findOrFail($id);

        if (in_array($envelope->status, ['completed', 'voided'])) {
            return ApiResponse::error("L'enveloppe est déjà {$envelope->status}.", 422);
        }

        $reason = $request->string('reason', 'Annulé par l\'opérateur');
        $envelope->update(['status' => 'voided']);
        $this->workflowService->recordEnvelopeEvent($envelope, 'declined', null, ['reason' => (string) $reason], $request);

        AuditLogger::legalAction(
            action: 'envelope_voided',
            subject: $envelope,
            user: $request->user(),
            request: $request,
            label: 'Enveloppe annulée',
            after: ['reason' => (string) $reason],
        );
        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'DIRECTEUR', 'ADMIN'],
            category: 'signature.voided',
            title: 'Enveloppe annulee',
            body: 'L\'enveloppe "'.$envelope->subject.'" a ete annulee.',
            module: 'signatures',
            priority: 'high',
            entity: $envelope,
            linkUrl: '/signatures/'.$envelope->id,
        );

        return ApiResponse::success($envelope->fresh());
    }

    // ── GET /signatures/envelopes/{id}/events ────────────────────────────

    public function events(string $id): JsonResponse
    {
        $envelope = SignatureEnvelope::findOrFail($id);
        $events   = $envelope->events()->with('signer')->orderBy('occurred_at')->get();
        return ApiResponse::success($events);
    }

    // ── POST /signatures/envelopes/{id}/verify-otp ───────────────────────
    // Called by the signer from the signing link (no auth required route)

    public function verifyOtp(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'signer_id' => 'required|uuid',
            'otp'       => 'required|string|size:6',
        ]);

        $envelope = SignatureEnvelope::with('signers')->findOrFail($id);
        $signer   = $envelope->signers()->findOrFail($data['signer_id']);

        if ($signer->status === 'signed') {
            return ApiResponse::error('Ce signataire a déjà signé.', 422);
        }

        $provider = $this->providerManager->resolve($envelope->provider);
        if (!$provider->verifyOtp($envelope, $signer, $data['otp'])) {
            return ApiResponse::error('Code OTP invalide ou expiré.', 422);
        }

        DB::transaction(function () use ($envelope, $signer, $request) {
            $signer->update([
                'opened_at'       => $signer->opened_at ?? now(),
                'status'          => 'opened',
                'ip_address'      => $request->ip(),
                'user_agent'      => $request->userAgent(),
            ]);
            $this->workflowService->recordEnvelopeEvent($envelope, 'opened', $signer, ['email' => $signer->email], $request);

            $signer->update([
                'status'         => 'otp_verified',
                'ip_address'     => $request->ip(),
                'user_agent'     => $request->userAgent(),
            ]);
            $this->workflowService->recordEnvelopeEvent($envelope, 'otp_verified', $signer, ['email' => $signer->email], $request);
        });

        return ApiResponse::message('OTP vérifié. Vous pouvez procéder à la signature.');
    }

    // ── POST /signatures/envelopes/{id}/sign ─────────────────────────────

    public function sign(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'signer_id'   => 'required|uuid',
            'signature'   => 'required|string', // base64 drawn signature or attestation token
        ]);

        $envelope = SignatureEnvelope::with('signers')->findOrFail($id);
        $signer   = $envelope->signers()->findOrFail($data['signer_id']);

        if (!in_array($signer->status, ['otp_verified', 'opened'])) {
            return ApiResponse::error('Veuillez vérifier votre OTP avant de signer.', 422);
        }

        DB::transaction(function () use ($envelope, $signer, $data, $request) {
            $provider = $this->providerManager->resolve($envelope->provider);
            $providerMeta = $provider->sign($envelope, $signer, $data['signature'], $request);

            $signer->update([
                'status'     => 'signed',
                'signed_at'  => now(),
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
            $this->workflowService->recordEnvelopeEvent($envelope, 'signed', $signer, ['provider_meta' => $providerMeta], $request);

            // Check if all signers have signed
            if ($envelope->allSigned()) {
                $envelope->update([
                    'status'       => 'completed',
                    'completed_at' => now(),
                ]);
                $this->workflowService->completeEnvelope($envelope, $request);
                $this->workflowService->recordEnvelopeEvent($envelope, 'completed', null, [], $request);

                // Update the linked document's status if it's a contract
                if ($envelope->signable_type && class_exists($envelope->signable_type)) {
                    $signable = $envelope->signable;
                    if ($signable && method_exists($signable, 'update')) {
                        $signable->update([
                            'signature_status' => 'signed',
                            'signed_at' => now(),
                        ]);
                    }
                }
            } else {
                $envelope->update(['status' => 'in_progress']);
                // Trigger next signer in sequence
                $nextSigner = $envelope->signers()
                    ->where('status', 'pending')
                    ->orderBy('signer_order')
                    ->first();
                if ($nextSigner && $envelope->provider === 'internal') {
                    $nextSigner->generateOtp();
                    $nextSigner->update(['status' => 'sent']);
                    $this->workflowService->recordEnvelopeEvent($envelope, 'otp_sent', $nextSigner, ['email' => $nextSigner->email], $request);
                }
            }
        });

        AuditLogger::legalAction(
            action: 'envelope_signed',
            subject: $envelope,
            user: $request->user(),
            request: $request,
            label: 'Signature enregistrée',
            after: ['signer_id' => $signer->id, 'signer_email' => $signer->email],
        );
        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'DIRECTEUR', 'ADMIN', 'CONTENTIEUX'],
            category: 'signature.signed',
            title: 'Signature enregistree',
            body: 'Un signataire a signe l\'enveloppe "'.$envelope->subject.'".',
            module: 'signatures',
            priority: 'high',
            entity: $envelope,
            linkUrl: '/signatures/'.$envelope->id,
        );

        return ApiResponse::success($envelope->fresh(['signers', 'events']));
    }

    // ── POST /signatures/envelopes/{id}/decline ──────────────────────────

    public function decline(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'signer_id'  => 'required|uuid',
            'reason'     => 'nullable|string|max:500',
        ]);

        $envelope = SignatureEnvelope::with('signers')->findOrFail($id);
        $signer   = $envelope->signers()->findOrFail($data['signer_id']);

        DB::transaction(function () use ($envelope, $signer, $data, $request) {
            $signer->update([
                'status'         => 'declined',
                'declined_at'    => now(),
                'decline_reason' => $data['reason'] ?? null,
                'ip_address'     => $request->ip(),
            ]);

            $envelope->update(['status' => 'declined']);
            $this->workflowService->recordEnvelopeEvent($envelope, 'declined', $signer, ['reason' => $data['reason'] ?? null], $request);
        });

        AuditLogger::legalAction(
            action: 'envelope_declined',
            subject: $envelope,
            user: $request->user(),
            request: $request,
            label: 'Signature refusée',
            after: ['signer_id' => $signer->id, 'reason' => $data['reason'] ?? null],
        );

        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'DIRECTEUR', 'ADMIN', 'CONTENTIEUX'],
            category: NotificationCategory::SIGNATURE_DECLINED,
            title: 'Signature refusée',
            body: 'Un signataire a refusé l\'enveloppe « '.$envelope->subject.' ».',
            module: 'signatures',
            priority: 'high',
            entity: $envelope,
            linkUrl: '/signatures/'.$envelope->id,
        );

        return ApiResponse::success($envelope->fresh(['signers', 'events']));
    }

    public function downloadSigned(Request $request, string $id): StreamedResponse|JsonResponse
    {
        $envelope = SignatureEnvelope::with('signedFile')->findOrFail($id);
        if (! $envelope->signedFile) {
            return ApiResponse::error('Aucun document signe disponible.', 404);
        }

        $doc = $envelope->signedFile;
        $disk = Storage::disk($doc->disk);
        if (! $disk->exists($doc->storage_path)) {
            return ApiResponse::error('Document signe introuvable sur le stockage.', 404);
        }

        $result = $this->documentAccess->resolveStream($request->user(), $request, 'gen-'.$doc->id, 'download');
        $stream = $disk->readStream($result->storagePath);
        if (! is_resource($stream)) {
            return ApiResponse::error('Document signe introuvable sur le stockage.', 404);
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

    private function resolveSourceFileId(?string $signableType, ?string $signableId): ?string
    {
        if (!$signableType || !$signableId) {
            return null;
        }

        return GeneratedDocument::query()
            ->where('entity_type', $signableType)
            ->where('entity_id', $signableId)
            ->orderByDesc('created_at')
            ->value('id');
    }

    private function envelopeHasAccessiblePdf(SignatureEnvelope $envelope): bool
    {
        if ($envelope->source_file_id) {
            $doc = GeneratedDocument::find($envelope->source_file_id);
            if (! $doc) {
                return false;
            }
            $disk = Storage::disk($doc->disk);

            return $disk->exists($doc->storage_path);
        }

        if ($envelope->document_path) {
            $diskName = (string) config('signature.document_storage_disk', config('filesystems.default', 'local'));

            return Storage::disk($diskName)->exists($envelope->document_path);
        }

        return false;
    }
}
