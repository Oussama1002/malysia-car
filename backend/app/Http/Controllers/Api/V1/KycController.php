<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Customer;
use App\Models\CustomerKycCase;
use App\Models\CustomerKycDocument;
use App\Notifications\NotificationCategory;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class KycController extends Controller
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function listCases(Customer $customer): JsonResponse
    {
        $cases = $customer->kycCases()->with('documents')->orderByDesc('created_at')->get();

        return ApiResponse::success($cases);
    }

    public function createCase(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'verification_level' => ['sometimes', 'in:basic,enhanced'],
        ]);
        $case = CustomerKycCase::create([
            'id' => (string) Str::uuid(),
            'customer_id' => $customer->id,
            'kyc_status' => 'pending',
            'verification_level' => $data['verification_level'] ?? 'basic',
        ]);
        $this->notifications->notifyRoles(
            roleCodes: ['ANALYSTE_CREDIT', 'DIRECTEUR', 'ADMIN'],
            category: 'kyc.pending_validation',
            title: 'KYC en attente de validation',
            body: 'Un dossier KYC client attend verification.',
            module: 'customers',
            priority: 'high',
            customerId: $customer->id,
            entity: $case,
            linkUrl: '/customers/'.$customer->id,
        );

        return ApiResponse::success($case, null, null, 201);
    }

    public function showCase(CustomerKycCase $kycCase): JsonResponse
    {
        if ($kycCase->kyc_status === 'approved' && $kycCase->expires_at && $kycCase->expires_at->isPast()) {
            $kycCase->kyc_status = 'expired';
            $kycCase->save();
        }
        $kycCase->load(['documents', 'reviewer']);

        return ApiResponse::success($kycCase);
    }

    public function uploadDocument(Request $request, CustomerKycCase $kycCase): JsonResponse
    {
        $data = $request->validate([
            'document_type' => ['required', 'string', 'max:80'],
            'document_number' => ['nullable', 'string', 'max:120'],
            'issued_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
            'file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpg,jpeg,png,webp'],
        ]);
        $file = $request->file('file');
        $path = $file->store('kyc/'.$kycCase->id, 'local');

        $doc = CustomerKycDocument::create([
            'id' => (string) Str::uuid(),
            'kyc_case_id' => $kycCase->id,
            'document_type' => $data['document_type'],
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
            'document_number' => $data['document_number'] ?? null,
            'issued_at' => $data['issued_at'] ?? null,
            'expires_at' => $data['expires_at'] ?? null,
            'notes' => $data['notes'] ?? null,
            'verification_status' => 'pending',
        ]);

        if (in_array($kycCase->kyc_status, ['pending', 'rejected'], true)) {
            $kycCase->kyc_status = 'in_review';
            $kycCase->save();
        }

        AuditLogger::legalAction(
            action: 'kyc_document_uploaded',
            subject: $doc,
            user: $request->user(),
            request: $request,
            label: 'Document KYC déposé',
        );
        $this->notifications->notifyRoles(
            roleCodes: ['ANALYSTE_CREDIT', 'DIRECTEUR', 'ADMIN'],
            category: 'kyc.document_uploaded',
            title: 'Document KYC déposé',
            body: 'Un nouveau document KYC a été déposé pour validation.',
            module: 'customers',
            priority: 'normal',
            customerId: $kycCase->customer_id,
            entity: $doc,
            linkUrl: '/customers/'.$kycCase->customer_id,
        );

        return ApiResponse::success($doc, null, null, 201);
    }

    public function verifyDocument(Request $request, CustomerKycDocument $document): JsonResponse
    {
        $data = $request->validate([
            'verification_status' => ['required', 'in:verified,rejected,pending'],
            'notes' => ['nullable', 'string', 'max:500', 'required_if:verification_status,rejected'],
        ]);
        $kycCase = $document->kycCase;
        if (! $kycCase) {
            return ApiResponse::error('KYC case not found for document.', 404);
        }

        $this->assertReviewerRole($request);

        $document->verification_status = $data['verification_status'];
        $document->notes = $data['notes'] ?? $document->notes;
        $document->verified_by = optional($request->user())->id;
        $document->verified_at = now();
        $document->save();

        if ($kycCase->kyc_status === 'pending') {
            $kycCase->kyc_status = 'in_review';
            $kycCase->save();
        }

        AuditLogger::legalAction(
            action: $document->verification_status === 'rejected' ? 'kyc_document_rejected' : 'kyc_document_verified',
            subject: $document,
            user: $request->user(),
            request: $request,
            label: $document->verification_status === 'rejected' ? 'Document KYC rejeté' : 'Document KYC vérifié',
            after: ['verification_status' => $document->verification_status],
        );
        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'ANALYSTE_CREDIT', 'DIRECTEUR', 'ADMIN'],
            category: $document->verification_status === 'rejected' ? 'kyc.document_rejected' : 'kyc.document_verified',
            title: $document->verification_status === 'rejected' ? 'Document KYC rejeté' : 'Document KYC vérifié',
            body: $document->verification_status === 'rejected'
                ? 'Un document KYC a été rejeté et nécessite correction.'
                : 'Un document KYC a été vérifié.',
            module: 'customers',
            priority: $document->verification_status === 'rejected' ? 'high' : 'normal',
            customerId: $kycCase->customer_id,
            entity: $kycCase,
            linkUrl: '/customers/'.$kycCase->customer_id,
        );

        return ApiResponse::success($document);
    }

    public function destroyDocument(CustomerKycDocument $document, Request $request): JsonResponse
    {
        if ($document->file_path) {
            Storage::disk('local')->delete($document->file_path);
        }
        AuditLogger::deleted($document, $request->user(), request: $request, legal: true);
        $document->delete();

        return ApiResponse::message('Document deleted', 200);
    }

    public function approve(Request $request, CustomerKycCase $kycCase): JsonResponse
    {
        $this->assertReviewerRole($request);

        $data = $request->validate([
            'risk_score' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'verification_level' => ['sometimes', 'in:basic,enhanced'],
        ]);
        $case = $kycCase->fresh('documents');
        if (! $case || ! $this->canApproveCase($case)) {
            return ApiResponse::error('KYC case cannot be approved: required documents are missing or unverified.', 422);
        }

        DB::transaction(function () use ($kycCase, $data, $request) {
            $kycCase->kyc_status = 'approved';
            $kycCase->reviewed_by = optional($request->user())->id;
            $kycCase->reviewed_at = now();
            $kycCase->rejection_reason = null;
            if (array_key_exists('risk_score', $data)) {
                $kycCase->risk_score = $data['risk_score'];
            }
            if (! empty($data['verification_level'])) {
                $kycCase->verification_level = $data['verification_level'];
            }
            $kycCase->expires_at = now()->addYear();
            $kycCase->save();

            // Escalate customer risk_level based on risk_score if provided
            if (array_key_exists('risk_score', $data)) {
                $rl = $this->riskLevelFromScore((float) $data['risk_score']);
                $kycCase->customer()->update(['risk_level' => $rl]);
            }
        });

        AuditLogger::legalAction(
            action: 'kyc_approved',
            subject: $kycCase,
            user: $request->user(),
            request: $request,
            label: 'KYC approuvé',
        );

        return ApiResponse::success($kycCase->fresh('customer'));
    }

    public function reject(Request $request, CustomerKycCase $kycCase): JsonResponse
    {
        $this->assertReviewerRole($request);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:2000'],
        ]);
        $kycCase->kyc_status = 'rejected';
        $kycCase->rejection_reason = $data['reason'];
        $kycCase->reviewed_by = optional($request->user())->id;
        $kycCase->reviewed_at = now();
        $kycCase->save();

        AuditLogger::legalAction(
            action: 'kyc_rejected',
            subject: $kycCase,
            user: $request->user(),
            request: $request,
            label: 'KYC rejeté',
            after: ['rejection_reason' => $kycCase->rejection_reason],
        );

        $this->notifications->notifyRoles(
            roleCodes: ['AGENT_COMMERCIAL', 'DIRECTEUR', 'ADMIN'],
            category: NotificationCategory::KYC_REJECTED,
            title: 'KYC rejeté',
            body: 'Le dossier KYC a été rejeté : '.Str::limit((string) $kycCase->rejection_reason, 200),
            module: 'customers',
            priority: 'high',
            customerId: $kycCase->customer_id,
            entity: $kycCase,
            linkUrl: '/customers/'.$kycCase->customer_id,
        );

        return ApiResponse::success($kycCase->fresh());
    }

    private function riskLevelFromScore(float $score): string
    {
        if ($score >= 81) {
            return 'low';
        }
        if ($score >= 61) {
            return 'normal';
        }
        if ($score >= 41) {
            return 'elevated';
        }

        return 'high';
    }

    private function requiredDocumentTypes(string $verificationLevel): array
    {
        $base = ['cin', 'proof_of_address'];
        if ($verificationLevel === 'enhanced') {
            $base[] = 'payslip';
        }

        return $base;
    }

    private function canApproveCase(CustomerKycCase $kycCase): bool
    {
        $documents = $kycCase->documents;
        if ($documents->isEmpty()) {
            return false;
        }
        if ($documents->contains(fn ($doc) => $doc->verification_status === 'rejected')) {
            return false;
        }

        $required = $this->requiredDocumentTypes((string) $kycCase->verification_level);
        foreach ($required as $type) {
            $ok = $documents->first(function ($doc) use ($type) {
                return strtolower((string) $doc->document_type) === $type && $doc->verification_status === 'verified';
            });
            if (! $ok) {
                return false;
            }
        }

        return true;
    }

    private function assertReviewerRole(Request $request): void
    {
        $role = strtoupper((string) ($request->user()?->primaryRoleCode() ?? ''));
        if (! in_array($role, ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'], true)) {
            abort(Response::HTTP_FORBIDDEN, 'Only KYC reviewers can approve/reject/verify.');
        }
    }
}
