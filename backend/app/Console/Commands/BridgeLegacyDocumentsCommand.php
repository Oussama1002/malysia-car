<?php

namespace App\Console\Commands;

use App\Models\AccidentDocument;
use App\Models\CustomerKycCase;
use App\Models\CustomerKycDocument;
use App\Models\EntityAttachment;
use App\Models\MissionPhoto;
use App\Models\User;
use App\Models\VehicleDocument;
use App\Services\DocumentService;
use Illuminate\Console\Command;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class BridgeLegacyDocumentsCommand extends Command
{
    protected $signature = 'driveflow:bridge-legacy-documents {--dry-run : Show actions without writing}';
    protected $description = 'Bridge legacy vehicle/KYC/accident/mission docs into document center';

    public function handle(DocumentService $documents): int
    {
        $dry = (bool) $this->option('dry-run');
        $user = User::query()->where('role', 'ADMIN')->first() ?? User::query()->first();
        if (! $user) {
            $this->error('No user available for attribution.');
            return self::FAILURE;
        }

        $count = 0;
        foreach (VehicleDocument::query()->cursor() as $vd) {
            $disk = $vd->storage_disk ?: 'local';
            $path = $vd->storage_path;
            if (! $path || ! Storage::disk($disk)->exists($path)) {
                continue;
            }
            $exists = EntityAttachment::query()
                ->where('entity_type', 'vehicle')
                ->where('entity_id', $vd->vehicle_id)
                ->where('category', 'legacy_vehicle_doc:'.$vd->type)
                ->whereHas('file', fn ($q) => $q->where('storage_path', $path))
                ->exists();
            if ($exists) {
                continue;
            }
            if ($dry) {
                $this->line("[dry-run] bridge vehicle_document {$vd->id}");
                $count++;
                continue;
            }
            $abs = Storage::disk($disk)->path($path);
            $uploaded = new UploadedFile($abs, $vd->original_filename ?? basename($path), $vd->mime_type, null, true);
            $file = $documents->storeUploadedFile($uploaded, $user, 'bridge/vehicle-documents');
            $documents->attachToEntity($file, 'vehicle', (string) $vd->vehicle_id, [
                'category' => 'legacy_vehicle_doc:'.$vd->type,
                'title' => $vd->original_filename ?? $vd->type,
                'notes' => 'Bridged from vehicle_documents',
                'visibility' => 'internal',
                'issue_date' => $vd->issued_at,
                'expiry_date' => $vd->expires_at,
                'document_number' => $vd->number,
                'status' => 'active',
            ], $user);
            $count++;
        }

        foreach (AccidentDocument::query()->cursor() as $ad) {
            $disk = $ad->disk ?: 'local';
            $path = $ad->path;
            if (! $path || ! Storage::disk($disk)->exists($path)) {
                continue;
            }
            $accident = $ad->accident;
            if (! $accident) {
                continue;
            }
            $exists = EntityAttachment::query()
                ->where('entity_type', 'accident')
                ->where('entity_id', (string) $accident->getKey())
                ->where('category', 'legacy_accident:'.$ad->type)
                ->whereHas('file', fn ($q) => $q->where('storage_path', $path))
                ->exists();
            if ($exists) {
                continue;
            }
            if ($dry) {
                $this->line("[dry-run] bridge accident_document {$ad->id}");
                $count++;
                continue;
            }
            $abs = Storage::disk($disk)->path($path);
            $uploaded = new UploadedFile($abs, $ad->filename ?? basename($path), $ad->mime_type ?: 'application/octet-stream', null, true);
            $file = $documents->storeUploadedFile($uploaded, $user, 'bridge/accident-documents');
            $documents->attachToEntity($file, 'accident', (string) $accident->getKey(), [
                'category' => 'legacy_accident:'.$ad->type,
                'title' => $ad->filename ?? 'Accident document',
                'notes' => 'Bridged from accident_documents',
                'visibility' => 'internal',
                'status' => 'active',
            ], $user);
            $count++;
        }

        foreach (CustomerKycDocument::query()->cursor() as $kd) {
            $path = $kd->file_path;
            if (! $path || ! Storage::disk('local')->exists($path)) {
                continue;
            }
            $case = CustomerKycCase::query()->find($kd->kyc_case_id);
            if (! $case) {
                continue;
            }
            $exists = EntityAttachment::query()
                ->where('entity_type', 'customer')
                ->where('entity_id', (string) $case->customer_id)
                ->where('category', 'legacy_kyc:'.$kd->document_type)
                ->whereHas('file', fn ($q) => $q->where('storage_path', $path))
                ->exists();
            if ($exists) {
                continue;
            }
            if ($dry) {
                $this->line("[dry-run] bridge kyc_document {$kd->id}");
                $count++;
                continue;
            }
            $abs = Storage::disk('local')->path($path);
            $uploaded = new UploadedFile($abs, $kd->file_name ?? basename($path), $kd->mime_type, null, true);
            $file = $documents->storeUploadedFile($uploaded, $user, 'bridge/kyc-documents');
            $documents->attachToEntity($file, 'customer', (string) $case->customer_id, [
                'category' => 'legacy_kyc:'.$kd->document_type,
                'title' => $kd->file_name ?? $kd->document_type,
                'notes' => 'Bridged from customer_kyc_documents',
                'visibility' => 'restricted',
                'issue_date' => $kd->issued_at,
                'expiry_date' => $kd->expires_at,
                'document_number' => $kd->document_number,
                'status' => 'active',
            ], $user);
            $count++;
        }

        foreach (MissionPhoto::query()->cursor() as $mp) {
            $disk = $mp->storage_disk ?: 'local';
            $path = $mp->storage_path;
            if (! $path || ! Storage::disk($disk)->exists($path)) {
                continue;
            }
            $exists = EntityAttachment::query()
                ->where('entity_type', 'mission')
                ->where('entity_id', (string) $mp->mission_id)
                ->where('category', 'legacy_mission_photo:'.($mp->phase ?? 'photo'))
                ->whereHas('file', fn ($q) => $q->where('storage_path', $path))
                ->exists();
            if ($exists) {
                continue;
            }
            if ($dry) {
                $this->line("[dry-run] bridge mission_photo {$mp->id}");
                $count++;
                continue;
            }
            $abs = Storage::disk($disk)->path($path);
            $uploaded = new UploadedFile($abs, $mp->original_filename ?? basename($path), $mp->mime_type ?: 'image/jpeg', null, true);
            $file = $documents->storeUploadedFile($uploaded, $user, 'bridge/mission-photos');
            $documents->attachToEntity($file, 'mission', (string) $mp->mission_id, [
                'category' => 'legacy_mission_photo:'.($mp->phase ?? 'photo'),
                'title' => $mp->label ?? $mp->original_filename ?? 'Mission photo',
                'notes' => 'Bridged from mission_photos',
                'visibility' => 'internal',
                'status' => 'active',
            ], $user);
            $count++;
        }

        $this->info("Bridged {$count} document(s)".($dry ? ' (dry-run)' : '').'.');
        return self::SUCCESS;
    }
}
