<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill audit_logs.entity_type and app_notifications.entity_type from the
 * legacy "App\\Models\\…" FQCN form to the short morph-alias form registered
 * in AppServiceProvider::boot() (QA 2026-11-24 M8). Without this, the audit
 * filter dropdown (which lists short codes only) hides every row written
 * before the morph map existed.
 */
return new class extends Migration
{
    private const MAP = [
        'App\\Models\\Contract' => 'contract',
        'App\\Models\\Reservation' => 'reservation',
        'App\\Models\\Payment' => 'payment',
        'App\\Models\\Customer' => 'customer',
        'App\\Models\\Vehicle' => 'vehicle',
        'App\\Models\\Invoice' => 'invoice',
        'App\\Models\\Mission' => 'mission',
        'App\\Models\\User' => 'user',
        'App\\Models\\Notification' => 'notification',
        'App\\Models\\WebsiteLead' => 'website_lead',
        'App\\Models\\CustomerKycCase' => 'kyc_case',
        'App\\Models\\CreditApplication' => 'credit_application',
        'App\\Models\\ArrearsCase' => 'arrears_case',
        'App\\Models\\SignatureEnvelope' => 'signature_envelope',
        'App\\Models\\EntityAttachment' => 'entity_attachment',
        'App\\Models\\SupplierAgency' => 'supplier_agency',
        'App\\Models\\SubRentalContract' => 'sub_rental_contract',
        'App\\Models\\SubRentalPayment' => 'sub_rental_payment',
        'App\\Models\\VehicleSwapRequest' => 'vehicle_swap_request',
        'App\\Models\\VehicleMaintenancePlan' => 'vehicle_maintenance_plan',
        'App\\Models\\VehicleMovement' => 'vehicle_movement',
        'App\\Models\\FranchiseRule' => 'franchise_rule',
    ];

    public function up(): void
    {
        foreach (self::MAP as $fqcn => $short) {
            DB::table('audit_logs')->where('entity_type', $fqcn)->update(['entity_type' => $short]);
            DB::table('app_notifications')->where('entity_type', $fqcn)->update(['entity_type' => $short]);
        }
    }

    public function down(): void
    {
        // Backfill only — reversing would re-introduce the two-encoding bug.
    }
};
