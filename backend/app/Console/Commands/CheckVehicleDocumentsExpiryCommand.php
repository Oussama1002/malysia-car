<?php

namespace App\Console\Commands;

use App\Models\VehicleDocument;
use App\Services\MaintenanceAlertService;
use App\Services\NotificationService;
use Illuminate\Console\Command;

class CheckVehicleDocumentsExpiryCommand extends Command
{
    protected $signature = 'driveflow:check-vehicle-documents-expiry';
    protected $description = 'Check vehicle insurance/vignette/tech visit expiry';

    public function __construct(
        private readonly NotificationService $notifications,
        private readonly MaintenanceAlertService $alerts,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $count = 0;
        $docs = VehicleDocument::query()
            ->with('vehicle')
            ->whereIn('type', ['assurance', 'vignette', 'visite_technique'])
            ->whereNotNull('expires_at')
            ->get();

        foreach ($docs as $doc) {
            $vehicle = $doc->vehicle;
            if (!$vehicle || !$doc->expires_at) continue;
            $days = now()->startOfDay()->diffInDays($doc->expires_at->startOfDay(), false);
            if ($days > 30) continue;

            $isExpired = $days < 0;
            $severity = $isExpired ? 'critical' : 'high';
            $type = $isExpired ? 'document_expired' : 'document_due_soon';
            $label = match ($doc->type) {
                'assurance' => 'Assurance',
                'vignette' => 'Vignette',
                'visite_technique' => 'Visite technique',
                default => 'Document',
            };

            $title = $isExpired ? "{$label} expiree" : "{$label} bientot expiree";
            $description = "Vehicule {$vehicle->registration_number}";
            $this->alerts->createAlert(
                vehicle: $vehicle,
                type: $type.'_'.$doc->id,
                severity: $severity,
                title: $title,
                description: $description,
                payload: ['document_id' => $doc->id, 'days_remaining' => $days, 'type' => $doc->type],
                documentId: (int) $doc->id,
            );
            $this->notifications->notifyRoles(
                roleCodes: ['GESTIONNAIRE_FLOTTE', 'DIRECTEUR', 'ADMIN'],
                category: 'fleet.'.$type,
                title: $title,
                body: $description,
                module: 'fleet',
                priority: $severity,
                entity: $vehicle,
                linkUrl: '/fleet/'.$vehicle->id,
            );
            $count++;
        }

        $this->info("Document expiry checks complete: {$count} alert(s).");
        return self::SUCCESS;
    }
}
