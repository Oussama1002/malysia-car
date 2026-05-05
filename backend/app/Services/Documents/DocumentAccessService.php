<?php

namespace App\Services\Documents;

use App\Domain\Documents\DocumentClassification;
use App\Models\AccidentDocument;
use App\Models\Contract;
use App\Models\CustomerKycCase;
use App\Models\CustomerKycDocument;
use App\Models\EntityAttachment;
use App\Models\GeneratedDocument;
use App\Models\Invoice;
use App\Models\Mission;
use App\Models\MissionPhoto;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\VehicleAccident;
use App\Models\VehicleDocument;
use App\Services\AuditLogger;
use App\Services\DocumentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class DocumentAccessService
{
    public function resolveStream(User $user, Request $request, string $documentRef, string $action): DocumentStreamResult
    {
        $parsed = $this->parseDocumentRef($documentRef);

        $result = match ($parsed['kind']) {
            'generated' => $this->resolveGenerated($user, $request, $parsed['id'], $action),
            'attachment' => $this->resolveAttachment($user, $request, $parsed['id'], $action),
            'vehicle_doc' => $this->resolveVehicleDocument($user, $request, $parsed['id'], $action),
            'mission_photo' => $this->resolveMissionPhoto($user, $request, $parsed['id'], $action),
            'kyc_doc' => $this->resolveKycDocument($user, $request, $parsed['id'], $action),
            'accident_doc' => $this->resolveAccidentDocument($user, $request, $parsed['id'], $action),
        };

        $this->logGranted($user, $request, $action, $result);

        return $result;
    }

    /**
     * @return array{kind: string, id: string}
     */
    public function parseDocumentRef(string $documentRef): array
    {
        if (str_starts_with($documentRef, 'gen-')) {
            return ['kind' => 'generated', 'id' => substr($documentRef, 4)];
        }
        if (str_starts_with($documentRef, 'att-')) {
            return ['kind' => 'attachment', 'id' => substr($documentRef, 4)];
        }
        if (str_starts_with($documentRef, 'veh-')) {
            return ['kind' => 'vehicle_doc', 'id' => substr($documentRef, 4)];
        }
        if (str_starts_with($documentRef, 'mph-')) {
            return ['kind' => 'mission_photo', 'id' => substr($documentRef, 4)];
        }
        if (str_starts_with($documentRef, 'kyc-')) {
            return ['kind' => 'kyc_doc', 'id' => substr($documentRef, 4)];
        }
        if (str_starts_with($documentRef, 'acd-')) {
            return ['kind' => 'accident_doc', 'id' => substr($documentRef, 4)];
        }
        if (preg_match('/^[a-f0-9-]{36}$/i', $documentRef)) {
            return ['kind' => 'generated', 'id' => $documentRef];
        }
        if (preg_match('/^\d+$/', $documentRef)) {
            return ['kind' => 'attachment', 'id' => $documentRef];
        }

        abort(422, 'Identifiant de document invalide.');
    }

    public function assertCanViewGeneratedMetadata(User $user, Request $request, GeneratedDocument $doc): void
    {
        $this->assertCompany($user, $request, (string) ($doc->company_id ?? ''));
        $classification = DocumentClassification::forGenerated($doc->classification, (string) $doc->document_type);
        $this->enforceRoleForClassification($user, $request, $classification, $doc->entity_type, $doc->entity_id, null);
        $this->assertEntityOwnershipForPortal($user, $request, $doc->entity_type, $doc->entity_id);
    }

    private function resolveGenerated(User $user, Request $request, string $id, string $action): DocumentStreamResult
    {
        $doc = GeneratedDocument::query()->findOrFail($id);
        $this->assertCompany($user, $request, (string) ($doc->company_id ?? ''));
        $classification = DocumentClassification::forGenerated($doc->classification, (string) $doc->document_type);
        $this->enforceRoleForClassification($user, $request, $classification, $doc->entity_type, $doc->entity_id, null);
        $this->assertEntityOwnershipForPortal($user, $request, $doc->entity_type, $doc->entity_id);

        return new DocumentStreamResult(
            $doc->disk,
            $doc->storage_path,
            $doc->mime_type,
            basename($doc->storage_path),
            $doc->sha256,
            $classification,
            'generated',
        );
    }

    private function resolveAttachment(User $user, Request $request, string $id, string $action): DocumentStreamResult
    {
        $attachment = EntityAttachment::query()->with('file')->findOrFail($id);
        $file = $attachment->file;
        if (! $file) {
            abort(404);
        }
        $this->assertCompany($user, $request, (string) ($file->company_id ?? ''));
        $this->assertBranch($user, $request, $file->branch_id);
        $classification = DocumentClassification::forAttachment(
            $attachment->classification,
            (string) $attachment->entity_type,
            (string) $attachment->category,
        );
        $entityClass = DocumentService::slugToModelClass($attachment->entity_type);
        $this->enforceRoleForClassification($user, $request, $classification, $entityClass, $attachment->entity_id, $attachment->entity_type);
        $this->assertEntityOwnershipForPortal($user, $request, $entityClass, $attachment->entity_id);
        $this->assertAttachmentEntityScope($user, $request, $attachment);

        return new DocumentStreamResult(
            $file->storage_disk,
            $file->storage_path,
            $file->mime_type,
            $file->original_name,
            $file->checksum_sha256,
            $classification,
            'entity_attachment',
        );
    }

    private function resolveVehicleDocument(User $user, Request $request, string $id, string $action): DocumentStreamResult
    {
        $vd = VehicleDocument::query()->with('vehicle')->findOrFail($id);
        $vehicle = $vd->vehicle;
        if (! $vehicle) {
            abort(404);
        }
        $this->assertCompany($user, $request, (string) ($vehicle->company_id ?? ''));
        $this->assertBranch($user, $request, $vehicle->branch_id);
        $classification = $vd->classification ?? DocumentClassification::INTERNAL;
        $this->enforceFleetDocumentAccess($user, $request, $classification, 'vehicle', (string) $vehicle->id);

        return new DocumentStreamResult(
            $vd->storage_disk,
            $vd->storage_path,
            $vd->mime_type,
            $vd->original_filename,
            null,
            $classification,
            'vehicle_document',
        );
    }

    private function resolveMissionPhoto(User $user, Request $request, string $id, string $action): DocumentStreamResult
    {
        $photo = MissionPhoto::query()->findOrFail($id);
        $mission = Mission::query()->withoutGlobalScopes()->findOrFail($photo->mission_id);
        $this->assertCompany($user, $request, (string) ($mission->company_id ?? ''));
        $this->assertBranch($user, $request, $mission->branch_id);
        $this->enforceMissionPhotoAccess($user, $request, $mission);

        return new DocumentStreamResult(
            $photo->storage_disk,
            $photo->storage_path,
            $photo->mime_type,
            $photo->original_filename,
            null,
            DocumentClassification::INTERNAL,
            'mission_photo',
        );
    }

    private function resolveKycDocument(User $user, Request $request, string $id, string $action): DocumentStreamResult
    {
        $doc = CustomerKycDocument::query()->with('kycCase')->findOrFail($id);
        $case = $doc->kycCase;
        if (! $case) {
            abort(404);
        }
        $customerId = $case->customer_id;
        $customer = \App\Models\Customer::query()->find($customerId);
        $this->assertCompany($user, $request, (string) ($customer?->company_id ?? ''));
        $this->enforceKycAccess($user, $request, $customerId);
        $path = (string) $doc->file_path;
        $disk = 'local';

        return new DocumentStreamResult(
            $disk,
            $path,
            (string) ($doc->mime_type ?: 'application/octet-stream'),
            (string) ($doc->file_name ?: 'kyc-document'),
            null,
            DocumentClassification::KYC,
            'kyc_document',
        );
    }

    private function resolveAccidentDocument(User $user, Request $request, string $id, string $action): DocumentStreamResult
    {
        $ad = AccidentDocument::query()->with('accident.vehicle')->findOrFail($id);
        $accident = $ad->accident;
        $vehicle = $accident?->vehicle;
        if (! $vehicle) {
            abort(404);
        }
        $this->assertCompany($user, $request, (string) ($vehicle->company_id ?? ''));
        $this->assertBranch($user, $request, $vehicle->branch_id);
        $this->enforceFleetDocumentAccess($user, $request, DocumentClassification::LEGAL, 'accident', (string) $accident->id);

        return new DocumentStreamResult(
            $ad->disk,
            $ad->path,
            (string) ($ad->mime_type ?: 'application/octet-stream'),
            (string) ($ad->filename ?: 'accident-document'),
            null,
            DocumentClassification::LEGAL,
            'accident_document',
        );
    }

    private function assertCompany(User $user, Request $request, string $docCompanyId): void
    {
        if ($user->role === 'ADMIN') {
            return;
        }
        if ($docCompanyId === '' || $docCompanyId === '00000000-0000-0000-0000-000000000001') {
            return;
        }
        if ($user->company_id && $user->company_id !== $docCompanyId) {
            $this->deny($user, $request, 'company_mismatch', ['company_id' => $docCompanyId]);
        }
    }

    private function assertBranch(User $user, Request $request, mixed $docBranchId): void
    {
        if (in_array($user->role ?? '', ['ADMIN', 'DIRECTEUR'], true)) {
            return;
        }
        if (! $docBranchId || ! $user->branch_id) {
            return;
        }
        if ((string) $docBranchId !== (string) $user->branch_id) {
            $this->deny($user, $request, 'branch_mismatch', ['branch_id' => $docBranchId]);
        }
    }

    private function enforceRoleForClassification(User $user, Request $request, string $classification, ?string $entityType, ?string $entityId, ?string $entitySlug = null): void
    {
        $this->assertDocumentsView($user, $request);

        $role = (string) ($user->role ?? '');
        $slug = $entitySlug ?? ($entityType && ! str_contains($entityType, '\\')
            ? $entityType
            : (DocumentService::modelClassToSlug($entityType) ?? ''));

        if ($classification === DocumentClassification::KYC || $classification === DocumentClassification::SIGNED_CONTRACT) {
            if ($role === 'COMPTABLE' && ! $this->hasPerm($user, 'kyc.view') && ! $this->hasPerm($user, 'customers.view_dossier')) {
                $this->deny($user, $request, 'kyc_restricted', ['classification' => $classification]);
            }
        }

        if ($classification === DocumentClassification::FINANCIAL) {
            if (in_array($role, ['GESTIONNAIRE_FLOTTE', 'AGENT_LIVRAISON'], true) && ! $this->hasPerm($user, 'invoices.view')) {
                $this->deny($user, $request, 'financial_restricted', []);
            }
        }

        if ($classification === DocumentClassification::LEGAL) {
            $allowed = in_array($role, ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX', 'GESTIONNAIRE_FLOTTE', 'COMPTABLE'], true)
                || $this->hasPerm($user, 'legal.view')
                || $this->hasPerm($user, 'arrears.view');
            if (! $allowed) {
                $this->deny($user, $request, 'legal_restricted', []);
            }
        }

        if ($role === 'GESTIONNAIRE_FLOTTE' && ! $this->fleetRelatedEntitySlug($slug, $entityId)) {
            $this->deny($user, $request, 'fleet_scope', []);
        }

        if ($role === 'CONTENTIEUX') {
            if ($classification === DocumentClassification::KYC && ! $this->hasPerm($user, 'kyc.view')) {
                $this->deny($user, $request, 'contentieux_kyc', []);
            }
            if (! $this->contentieuxRelatedSlug($slug, $entityId)
                && ! in_array($classification, [DocumentClassification::LEGAL, DocumentClassification::FINANCIAL], true)) {
                $this->deny($user, $request, 'contentieux_scope', []);
            }
        }
    }

    private function assertAttachmentEntityScope(User $user, Request $request, EntityAttachment $attachment): void
    {
        $role = (string) ($user->role ?? '');
        if ($role === 'AGENT_LIVRAISON' && $attachment->entity_type === 'mission') {
            $mission = Mission::query()->find($attachment->entity_id);
            if (! $mission || (string) $mission->assigned_user_id !== (string) $user->id) {
                $this->deny($user, $request, 'mission_not_assigned', []);
            }
        }
    }

    private function enforceFleetDocumentAccess(User $user, Request $request, string $classification, string $entitySlug, string $entityId): void
    {
        $this->assertDocumentsView($user, $request);
        $role = (string) ($user->role ?? '');
        if (in_array($role, ['ADMIN', 'DIRECTEUR'], true)) {
            return;
        }
        if ($role === 'GESTIONNAIRE_FLOTTE' && $this->fleetRelatedEntitySlug($entitySlug, $entityId)) {
            return;
        }
        if ($role === 'CONTENTIEUX' && $entitySlug === 'accident') {
            return;
        }
        if ($role === 'AGENT_COMMERCIAL' && $entitySlug === 'vehicle') {
            return;
        }
        $this->deny($user, $request, 'fleet_document_denied', ['entity_slug' => $entitySlug]);
    }

    private function enforceMissionPhotoAccess(User $user, Request $request, Mission $mission): void
    {
        $this->assertDocumentsView($user, $request);
        $role = (string) ($user->role ?? '');
        if (in_array($role, ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'], true)) {
            return;
        }
        if ($role === 'AGENT_LIVRAISON' && (string) $mission->assigned_user_id === (string) $user->id) {
            return;
        }
        $this->deny($user, $request, 'mission_photo_denied', []);
    }

    private function enforceKycAccess(User $user, Request $request, string $customerId): void
    {
        $role = (string) ($user->role ?? '');
        if ($role === 'CLIENT_PORTAL') {
            if ((string) ($user->customer_id ?? '') !== (string) $customerId) {
                $this->deny($user, $request, 'portal_customer_mismatch', []);
            }
            $this->assertDocumentsView($user, $request);

            return;
        }
        if (! $this->hasPerm($user, 'kyc.view') && ! $this->hasPerm($user, 'customers.view_dossier') && ! in_array($role, ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT', 'AGENT_COMMERCIAL', 'CONTENTIEUX'], true)) {
            $this->deny($user, $request, 'kyc_permission', []);
        }
        $this->assertDocumentsView($user, $request);
    }

    private function assertEntityOwnershipForPortal(User $user, Request $request, ?string $entityType, ?string $entityId): void
    {
        if (($user->role ?? '') !== 'CLIENT_PORTAL' || ! $entityType || ! $entityId) {
            return;
        }
        $cid = (string) ($user->customer_id ?? '');
        if ($cid === '') {
            $this->deny($user, $request, 'portal_no_customer', []);
        }
        if ($entityType === Contract::class) {
            $c = Contract::query()->find($entityId);
            if (! $c || (string) $c->customer_id !== $cid) {
                $this->deny($user, $request, 'portal_contract', []);
            }
        }
        if ($entityType === Invoice::class) {
            $inv = Invoice::query()->find($entityId);
            if (! $inv || (string) $inv->customer_id !== $cid) {
                $this->deny($user, $request, 'portal_invoice', []);
            }
        }
    }

    private function fleetRelatedEntitySlug(string $slug, ?string $entityId): bool
    {
        if ($entityId === null || $entityId === '') {
            return false;
        }

        return in_array($slug, ['vehicle', 'accident', 'mission'], true);
    }

    private function contentieuxRelatedSlug(string $slug, ?string $entityId): bool
    {
        if ($entityId === null || $entityId === '') {
            return false;
        }

        return in_array($slug, ['contract', 'customer', 'invoice', 'arrears_case', 'kyc_case', 'credit_application'], true);
    }

    private function assertDocumentsView(User $user, Request $request): void
    {
        if ($user->role === 'ADMIN') {
            return;
        }
        if ($this->hasPerm($user, 'documents.view')) {
            return;
        }
        $this->deny($user, $request, 'missing_documents.view', []);
    }

    private function hasPerm(User $user, string $code): bool
    {
        if (! Schema::hasTable('permissions')) {
            return false;
        }
        if (method_exists($user, 'hasPermission')) {
            return $user->hasPermission($code);
        }

        return false;
    }

    private function deny(User $user, Request $request, string $reason, array $ctx): never
    {
        AuditLogger::record(
            action: 'document_access_denied',
            user: $user,
            entityType: 'document',
            entityId: null,
            before: null,
            after: array_merge(['reason' => $reason], $ctx),
            module: 'documents',
            legal: true,
            request: $request,
            label: 'Accès document refusé',
        );
        abort(403, 'Accès au document refusé.');
    }

    private function logGranted(User $user, Request $request, string $action, DocumentStreamResult $result): void
    {
        $map = [
            'download' => 'document_downloaded',
            'preview' => 'document_previewed',
            'view' => 'document_viewed',
        ];
        $auditAction = $map[$action] ?? 'document_accessed';
        AuditLogger::record(
            action: $auditAction,
            user: $user,
            entityType: $result->sourceLabel,
            entityId: null,
            after: [
                'classification' => $result->classification,
                'mime' => $result->mimeType,
                'path' => basename($result->storagePath),
            ],
            module: 'documents',
            legal: in_array($result->classification, [DocumentClassification::KYC, DocumentClassification::LEGAL, DocumentClassification::SIGNED_CONTRACT], true),
            request: $request,
            label: 'Accès document',
        );
    }

}
