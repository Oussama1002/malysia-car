<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BranchController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\CustomerSubresourceController;
use App\Http\Controllers\Api\V1\ContractController;
use App\Http\Controllers\Api\V1\ContractTemplateController;
use App\Http\Controllers\Api\V1\CreditApplicationController;
use App\Http\Controllers\Api\V1\CustomerBalanceController;
use App\Http\Controllers\Api\V1\GeofenceController;
use App\Http\Controllers\Api\V1\InvoiceController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\TreasuryController;
use App\Http\Controllers\Api\V1\UsedCarController;
use App\Http\Controllers\Api\V1\AccountingAccountController;
use App\Http\Controllers\Api\V1\AccountingJournalController;
use App\Http\Controllers\Api\V1\AccountingEntryController;
use App\Http\Controllers\Api\V1\AccountingReportController;
use App\Http\Controllers\Api\V1\AccountingBridgeController;
use App\Http\Controllers\Api\V1\AccountingSettingsController;
use App\Http\Controllers\Api\V1\FixedAssetController;
use App\Http\Controllers\Api\V1\FiscalYearController;
use App\Http\Controllers\Api\V1\TaxController;
use App\Http\Controllers\Api\V1\ArrearsCaseController;
use App\Http\Controllers\Api\V1\LegalCaseController;
use App\Http\Controllers\Api\V1\SignatureEnvelopeController;
use App\Http\Controllers\Api\V1\SignatureWebhookController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\GpsController;
use App\Http\Controllers\Api\V1\GpsDeviceController;
use App\Http\Controllers\Api\V1\GpsPositionIngestionController;
use App\Http\Controllers\Api\V1\GpsWebhookController;
use App\Http\Controllers\Api\V1\KycController;
use App\Http\Controllers\Api\V1\MissionController;
use App\Http\Controllers\Api\V1\MaintenanceMonitoringController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\NotificationTemplateController;
use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\AiAnomalyController;
use App\Http\Controllers\Api\V1\AiAssistantController;
use App\Http\Controllers\Api\V1\AiOverviewController;
use App\Http\Controllers\Api\V1\AiPredictionController;
use App\Http\Controllers\Api\V1\DocumentCenterController;
use App\Http\Controllers\Api\V1\GeneratedDocumentController;
use App\Http\Controllers\Api\V1\PasswordResetController;
use App\Http\Controllers\Api\V1\PermissionController;
use App\Http\Controllers\Api\V1\ReservationController;
use App\Http\Controllers\Api\V1\RentalController;
use App\Http\Controllers\Api\V1\SupplierAgencyController;
use App\Http\Controllers\Api\V1\SubRentalController;
use App\Http\Controllers\Api\V1\SubRentalPaymentController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\VehicleBrandController;
use App\Http\Controllers\Api\V1\VehicleController;
use App\Http\Controllers\Api\V1\VehicleDocumentController;
use App\Http\Controllers\Api\V1\VehicleMaintenanceEventController;
use App\Http\Controllers\Api\V1\VehicleGeofenceController;
use App\Http\Controllers\Api\V1\VehicleOdometerReadingController;
use App\Http\Controllers\Api\V1\VehicleProfitabilityController;
use App\Http\Controllers\Api\V1\VehiclePhotoController;
use App\Http\Controllers\Api\V1\VehicleMaintenancePlanController;
use App\Http\Controllers\Api\V1\VehicleInsurancePolicyController;
use App\Http\Controllers\Api\V1\VehicleTechnicalInspectionController;
use App\Http\Controllers\Api\V1\ComplianceAlertController;
use App\Http\Controllers\Api\V1\VehicleRepairController;
use App\Http\Controllers\Api\V1\VehicleMovementController;
use App\Http\Controllers\Api\V1\FleetAnalysisController;
use App\Http\Controllers\Api\V1\FixedChargeController;
use App\Http\Controllers\Api\V1\FixedChargePaymentController;
use App\Http\Controllers\Api\V1\VehicleAccidentController;
use App\Http\Controllers\Api\V1\TripController;
use Illuminate\Support\Facades\Route;

/*
| API v1 — base path is /api (see bootstrap/app.php) → full path /api/v1/...
|
| Authorization model:
|   - All non-public routes are guarded by `auth:sanctum`.
|   - Sensitive routes additionally enforce a granular permission via
|     `permission:<code>` (see config/erp.php and RbacSeeder for the catalogue).
|   - ADMIN bypasses every permission check (handled in middleware).
|   - Per-row scoping (e.g. CLIENT_PORTAL must only see their own data) is
|     enforced inside the relevant controllers, not here.
*/

Route::prefix('v1')->group(function () {
    Route::get('health', [HealthController::class, 'show']);

    // Signature provider webhook (public — secured by HMAC header verification)
    Route::post('signatures/webhooks/provider', [SignatureWebhookController::class, 'handle']);
    // GPS provider webhook (public — provider API key/HMAC/IP controls)
    Route::post('gps/webhooks/{provider}', [GpsWebhookController::class, 'handle']);

    // Public auth endpoints
    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:login');
    Route::post('auth/forgot-password', [PasswordResetController::class, 'forgot'])
        ->middleware('throttle:6,1');
    Route::post('auth/reset-password', [PasswordResetController::class, 'reset'])
        ->middleware('throttle:6,1');

    // Authenticated endpoints
    Route::middleware(['auth:sanctum', 'tenant.scope'])->group(function () {
        // === Identity (always allowed for the authenticated user)
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/me/avatar', [AuthController::class, 'updateAvatar']);

        // Branches: read-only catalogue used by every screen filter
        Route::get('branches', [BranchController::class, 'index']);

        // ==================================================================
        // Notifications (in-app + delivery tracking; retry: ADMIN / DIRECTEUR)
        // ==================================================================
        Route::get('notifications', [NotificationController::class, 'index'])
            ->middleware('permission:notifications.view');
        Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount'])
            ->middleware('permission:notifications.view');
        Route::get('notification-deliveries', [NotificationController::class, 'deliveriesIndex'])
            ->middleware('permission:notifications.view');
        Route::post('notifications/mark-all-read', [NotificationController::class, 'markAllRead'])
            ->middleware('permission:notifications.view');
        Route::post('notifications/{id}/mark-read', [NotificationController::class, 'markRead'])
            ->middleware('permission:notifications.view');
        Route::post('notifications/{id}/read', [NotificationController::class, 'markRead'])
            ->middleware('permission:notifications.view');
        Route::post('notifications/{id}/retry', [NotificationController::class, 'retry'])
            ->middleware(['permission:notifications.retry', 'role:ADMIN,DIRECTEUR']);
        Route::delete('notifications/{id}', [NotificationController::class, 'destroy'])
            ->middleware('permission:notifications.view');
        Route::get('notification-templates', [NotificationTemplateController::class, 'index'])
            ->middleware('permission:notifications.view');
        Route::post('notification-templates', [NotificationTemplateController::class, 'store'])
            ->middleware(['permission:notifications.manage', 'role:ADMIN,DIRECTEUR']);

        // ==================================================================
        // Audit logs (read-only) — also exposed under /audit and /entities/{type}/{id}/audit
        // ==================================================================
        Route::get('audit-logs', [AuditLogController::class, 'index'])
            ->middleware('permission:audit.view');
        Route::get('audit', [AuditLogController::class, 'index'])
            ->middleware('permission:audit.view');
        Route::get('audit/export.csv', [AuditLogController::class, 'exportCsv'])
            ->middleware('permission:audit.export');
        Route::get('audit/{id}', [AuditLogController::class, 'show'])
            ->middleware('permission:audit.view');
        Route::get('entities/{entityType}/{entityId}/audit', [AuditLogController::class, 'forEntity'])
            ->middleware('permission:audit.view');

        // ==================================================================
        // Document center (uploads + entity attachments + generated PDFs)
        // ==================================================================
        Route::get('documents/expiring', [DocumentCenterController::class, 'expiring'])
            ->middleware('permission:documents.view');
        Route::post('documents/upload', [DocumentCenterController::class, 'upload'])
            ->middleware('permission:documents.upload');
        Route::get('documents/{document}/download', [DocumentCenterController::class, 'download'])
            ->middleware('permission:documents.view');
        Route::get('documents/{document}/preview', [DocumentCenterController::class, 'preview'])
            ->middleware('permission:documents.view');
        Route::delete('documents/{document}', [DocumentCenterController::class, 'destroy'])
            ->middleware('permission:documents.delete');
        Route::get('documents', [DocumentCenterController::class, 'index'])
            ->middleware('permission:documents.view');
        Route::get('entities/{entityType}/{entityId}/documents', [DocumentCenterController::class, 'entityIndex'])
            ->middleware('permission:documents.view');
        Route::post('entities/{entityType}/{entityId}/documents', [DocumentCenterController::class, 'entityStore'])
            ->middleware('permission:documents.upload');

        Route::get('generated-documents/{id}', [GeneratedDocumentController::class, 'show'])
            ->middleware('permission:documents.view');
        Route::get('generated-documents/{id}/download', [GeneratedDocumentController::class, 'download'])
            ->middleware('permission:documents.view');
        Route::post('contracts/{contract}/generate-pdf', [GeneratedDocumentController::class, 'generateContract'])
            ->middleware('permission:documents.generate');
        Route::post('invoices/{invoice}/generate-pdf', [GeneratedDocumentController::class, 'generateInvoice'])
            ->middleware('permission:documents.generate');

        // ==================================================================
        // Phase 4 — Fleet
        // ==================================================================
        Route::get('vehicle-brands', [VehicleBrandController::class, 'index'])
            ->middleware('permission:vehicles.view');
        Route::post('vehicle-brands', [VehicleBrandController::class, 'storeBrand'])
            ->middleware('permission:vehicles.create');
        Route::put('vehicle-brands/{brand}', [VehicleBrandController::class, 'updateBrand'])
            ->middleware('permission:vehicles.create');
        Route::post('vehicle-models', [VehicleBrandController::class, 'storeModel'])
            ->middleware('permission:vehicles.create');
        Route::put('vehicle-models/{model}', [VehicleBrandController::class, 'updateModel'])
            ->middleware('permission:vehicles.create');

        Route::get('vehicles', [VehicleController::class, 'index'])
            ->middleware('permission:vehicles.view');
        Route::post('vehicles', [VehicleController::class, 'store'])
            ->middleware('permission:vehicles.create');
        Route::get('vehicles/{vehicle}', [VehicleController::class, 'show'])
            ->middleware('permission:vehicles.view');
        Route::put('vehicles/{vehicle}', [VehicleController::class, 'update'])
            ->middleware('permission:vehicles.update');
        Route::patch('vehicles/{vehicle}', [VehicleController::class, 'update'])
            ->middleware('permission:vehicles.update');
        Route::post('vehicles/{vehicle}/photo', [VehiclePhotoController::class, 'store'])
            ->middleware('permission:vehicles.upload_photo');
        Route::delete('vehicles/{vehicle}/photo', [VehiclePhotoController::class, 'destroy'])
            ->middleware('permission:vehicles.upload_photo');
        Route::post('vehicles/{vehicle}/documents', [VehicleDocumentController::class, 'store'])
            ->middleware('permission:vehicles.upload_document');
        Route::post('vehicles/{vehicle}/maintenance-events', [VehicleMaintenanceEventController::class, 'store'])
            ->middleware('permission:maintenance.event_create');
        Route::post('vehicles/{vehicle}/odometer-readings', [VehicleOdometerReadingController::class, 'store'])
            ->middleware('permission:odometer.create');
        Route::get('vehicles/{vehicle}/profitability', [VehicleProfitabilityController::class, 'show'])
            ->middleware('permission:vehicles.view_profitability');

        // Maintenance plans
        Route::get('vehicles/{vehicle}/maintenance-plans', [VehicleMaintenancePlanController::class, 'index'])
            ->middleware('permission:maintenance.view');
        Route::post('vehicles/{vehicle}/maintenance-plans', [VehicleMaintenancePlanController::class, 'store'])
            ->middleware('permission:maintenance.manage');
        Route::put('maintenance-plans/{plan}', [VehicleMaintenancePlanController::class, 'update'])
            ->middleware('permission:maintenance.manage');
        Route::patch('maintenance-plans/{plan}', [VehicleMaintenancePlanController::class, 'update'])
            ->middleware('permission:maintenance.manage');
        Route::delete('maintenance-plans/{plan}', [VehicleMaintenancePlanController::class, 'destroy'])
            ->middleware('permission:maintenance.manage');
        Route::get('maintenance/alerts', [MaintenanceMonitoringController::class, 'alerts'])
            ->middleware('permission:maintenance.view');
        Route::get('maintenance/calendar', [MaintenanceMonitoringController::class, 'calendar'])
            ->middleware('permission:maintenance.view');
        Route::get('compliance/alerts', [ComplianceAlertController::class, 'index'])
            ->middleware('permission:maintenance.view');

        // Compliance lifecycle: insurance + technical inspection
        Route::get('vehicles/{vehicle}/insurance-policies', [VehicleInsurancePolicyController::class, 'index'])
            ->middleware('permission:vehicles.view');
        Route::post('vehicles/{vehicle}/insurance-policies', [VehicleInsurancePolicyController::class, 'store'])
            ->middleware('permission:vehicles.update');
        Route::put('insurance-policies/{policy}', [VehicleInsurancePolicyController::class, 'update'])
            ->middleware('permission:vehicles.update');
        Route::patch('insurance-policies/{policy}', [VehicleInsurancePolicyController::class, 'update'])
            ->middleware('permission:vehicles.update');
        Route::get('vehicles/{vehicle}/technical-inspections', [VehicleTechnicalInspectionController::class, 'index'])
            ->middleware('permission:vehicles.view');
        Route::post('vehicles/{vehicle}/technical-inspections', [VehicleTechnicalInspectionController::class, 'store'])
            ->middleware('permission:vehicles.update');
        Route::put('technical-inspections/{inspection}', [VehicleTechnicalInspectionController::class, 'update'])
            ->middleware('permission:vehicles.update');
        Route::patch('technical-inspections/{inspection}', [VehicleTechnicalInspectionController::class, 'update'])
            ->middleware('permission:vehicles.update');

        // Repairs
        Route::get('vehicles/{vehicle}/repairs', [VehicleRepairController::class, 'index'])
            ->middleware('permission:repairs.view');
        Route::post('vehicles/{vehicle}/repairs', [VehicleRepairController::class, 'store'])
            ->middleware('permission:repairs.manage');
        Route::put('repairs/{repair}', [VehicleRepairController::class, 'update'])
            ->middleware('permission:repairs.manage');
        Route::patch('repairs/{repair}', [VehicleRepairController::class, 'update'])
            ->middleware('permission:repairs.manage');
        Route::post('repairs/{repair}/start', [VehicleRepairController::class, 'start'])
            ->middleware('permission:repairs.manage');
        Route::post('repairs/{repair}/complete', [VehicleRepairController::class, 'complete'])
            ->middleware('permission:repairs.manage');

        Route::post('vehicles/{vehicle}/entry', [VehicleMovementController::class, 'entry'])
            ->middleware('permission:vehicles.update');
        Route::post('vehicles/{vehicle}/exit', [VehicleMovementController::class, 'exit'])
            ->middleware('permission:vehicles.update');
        Route::post('vehicles/{vehicle}/return', [VehicleMovementController::class, 'returnMovement'])
            ->middleware('permission:vehicles.update');
        Route::get('vehicles/{vehicle}/movements', [VehicleMovementController::class, 'index'])
            ->middleware('permission:vehicles.view');

        Route::post('maintenance-events/{maintenance_event}/start', [VehicleMaintenanceEventController::class, 'start'])
            ->middleware('permission:maintenance.event_create');
        Route::post('maintenance-events/{maintenance_event}/complete', [VehicleMaintenanceEventController::class, 'complete'])
            ->middleware('permission:maintenance.event_create');

        // Accidents
        Route::get('vehicles/{vehicle}/accidents', [VehicleAccidentController::class, 'index'])
            ->middleware('permission:accidents.view');
        Route::post('vehicles/{vehicle}/accidents', [VehicleAccidentController::class, 'store'])
            ->middleware('permission:accidents.manage');
        Route::put('accidents/{accident}', [VehicleAccidentController::class, 'update'])
            ->middleware('permission:accidents.manage');
        Route::patch('accidents/{accident}', [VehicleAccidentController::class, 'update'])
            ->middleware('permission:accidents.manage');
        Route::post('accidents/{accident}/transition', [VehicleAccidentController::class, 'transition'])
            ->middleware('permission:accidents.transition');
        Route::post('accidents/{accident}/documents', [VehicleAccidentController::class, 'uploadDocument'])
            ->middleware('permission:accidents.manage');

        // Vehicle full history & costs
        Route::get('vehicles/{vehicle}/history', [VehicleAccidentController::class, 'history'])
            ->middleware('permission:vehicles.view_history');
        Route::get('vehicles/{vehicle}/costs', [VehicleProfitabilityController::class, 'show'])
            ->middleware('permission:vehicles.view_profitability');

        // Backwards-compatible aliases used by frontend `endpoints.ts`
        Route::get('fleet/vehicles', [VehicleController::class, 'index'])
            ->middleware('permission:vehicles.view');
        Route::get('fleet/vehicles/{vehicle}', [VehicleController::class, 'show'])
            ->middleware('permission:vehicles.view');

        Route::get('fleet/analysis', FleetAnalysisController::class)
            ->middleware('permission:vehicles.view');

        // ==================================================================
        // Phase 5 — Contracts
        // ==================================================================
        Route::get('contract-templates', [ContractTemplateController::class, 'index'])
            ->middleware('permission:contract_templates.view');
        Route::get('contract-templates/{contractTemplate}', [ContractTemplateController::class, 'show'])
            ->middleware('permission:contract_templates.view');
        Route::post('contract-templates', [ContractTemplateController::class, 'store'])
            ->middleware('permission:contract_templates.manage');
        Route::put('contract-templates/{contractTemplate}', [ContractTemplateController::class, 'update'])
            ->middleware('permission:contract_templates.manage');
        Route::patch('contract-templates/{contractTemplate}', [ContractTemplateController::class, 'update'])
            ->middleware('permission:contract_templates.manage');
        Route::delete('contract-templates/{contractTemplate}', [ContractTemplateController::class, 'destroy'])
            ->middleware('permission:contract_templates.manage');

        Route::get('contracts', [ContractController::class, 'index'])
            ->middleware('permission:contracts.view');
        Route::get('contracts/{contract}', [ContractController::class, 'show'])
            ->middleware('permission:contracts.view');
        Route::get('contracts/{contract}/installments', [ContractController::class, 'installments'])
            ->middleware('permission:contracts.view_installments');
        Route::post('contracts', [ContractController::class, 'store'])
            ->middleware('permission:contracts.create');
        Route::put('contracts/{contract}', [ContractController::class, 'update'])
            ->middleware('permission:contracts.update');
        Route::patch('contracts/{contract}', [ContractController::class, 'update'])
            ->middleware('permission:contracts.update');
        Route::post('contracts/{contract}/approve', [ContractController::class, 'approve'])
            ->middleware('permission:contracts.approve');
        Route::post('contracts/{contract}/activate', [ContractController::class, 'activate'])
            ->middleware('permission:contracts.activate');
        Route::post('contracts/{contract}/terminate', [ContractController::class, 'terminate'])
            ->middleware('permission:contracts.terminate');
        Route::post('contracts/{contract}/generate-schedule', [ContractController::class, 'generateSchedule'])
            ->middleware('permission:contracts.generate_schedule');

        // ==================================================================
        // Phase 6 — Credit applications
        // ==================================================================
        Route::get('credit-applications', [CreditApplicationController::class, 'index'])
            ->middleware('permission:credit.view');
        Route::get('credit-applications/{creditApplication}', [CreditApplicationController::class, 'show'])
            ->middleware('permission:credit.view');
        Route::post('credit-applications', [CreditApplicationController::class, 'store'])
            ->middleware('permission:credit.create');
        Route::put('credit-applications/{creditApplication}', [CreditApplicationController::class, 'update'])
            ->middleware('permission:credit.update');
        Route::patch('credit-applications/{creditApplication}', [CreditApplicationController::class, 'update'])
            ->middleware('permission:credit.update');
        Route::post('credit-applications/{creditApplication}/score', [CreditApplicationController::class, 'score'])
            ->middleware('permission:credit.score');
        Route::get('credit-applications/{creditApplication}/scores', [CreditApplicationController::class, 'scores'])
            ->middleware('permission:credit.view');
        Route::get('credit-applications/{creditApplication}/latest-score', [CreditApplicationController::class, 'latestScore'])
            ->middleware('permission:credit.view');
        Route::post('credit-applications/{creditApplication}/decision', [CreditApplicationController::class, 'decision'])
            ->middleware('permission:credit.decide');

        // ==================================================================
        // Phase 7 — GPS / Geofencing
        // ==================================================================
        Route::get('gps/devices', [GpsDeviceController::class, 'index'])
            ->middleware('permission:gps.devices.view');
        Route::get('gps/devices/{gpsDevice}', [GpsDeviceController::class, 'show'])
            ->middleware('permission:gps.devices.view');
        Route::post('gps/devices', [GpsDeviceController::class, 'store'])
            ->middleware('permission:gps.devices.manage');
        Route::put('gps/devices/{gpsDevice}', [GpsDeviceController::class, 'update'])
            ->middleware('permission:gps.devices.manage');
        Route::patch('gps/devices/{gpsDevice}', [GpsDeviceController::class, 'update'])
            ->middleware('permission:gps.devices.manage');
        Route::post('gps/devices/{gpsDevice}/assign', [GpsDeviceController::class, 'assign'])
            ->middleware('permission:gps.devices.assign');

        Route::post('gps/positions', [GpsPositionIngestionController::class, 'store'])
            ->middleware('permission:gps.positions.ingest');
        Route::get('gps/vehicles/live', [GpsController::class, 'vehiclesLive'])
            ->middleware('permission:gps.positions.view');
        Route::get('vehicles/{vehicle}/positions', [GpsController::class, 'vehiclePositions'])
            ->middleware('permission:gps.positions.view');
        Route::get('vehicles/{vehicle}/trips', [TripController::class, 'indexForVehicle'])
            ->middleware('permission:trips.view');
        Route::get('geofences', [GeofenceController::class, 'index'])
            ->middleware('permission:geofences.view');
        Route::post('geofences', [GeofenceController::class, 'store'])
            ->middleware('permission:geofences.create');
        Route::post('vehicles/{vehicle}/geofences', [VehicleGeofenceController::class, 'assign'])
            ->middleware('permission:geofences.assign');
        Route::get('gps/alerts', [GpsController::class, 'alerts'])
            ->middleware('permission:gps.alerts.view');

        // ==================================================================
        // Phase 8 — Reservations / Missions
        // ==================================================================
        Route::get('reservations', [ReservationController::class, 'index'])
            ->middleware('permission:reservations.view');
        Route::get('reservations/{reservation}', [ReservationController::class, 'show'])
            ->middleware('permission:reservations.view');
        Route::post('reservations', [ReservationController::class, 'store'])
            ->middleware('permission:reservations.create');
        Route::put('reservations/{reservation}', [ReservationController::class, 'update'])
            ->middleware('permission:reservations.create');
        Route::patch('reservations/{reservation}', [ReservationController::class, 'update'])
            ->middleware('permission:reservations.create');
        Route::post('reservations/{reservation}/return', [ReservationController::class, 'rentalReturn'])
            ->middleware('permission:rentals.handover_return');
        Route::get('rentals/availability', [RentalController::class, 'availability'])
            ->middleware('permission:rentals.availability');
        Route::post('reservations/{reservation}/confirm', [ReservationController::class, 'confirm'])
            ->middleware('permission:reservations.confirm');
        Route::post('reservations/{reservation}/cancel', [ReservationController::class, 'cancel'])
            ->middleware('permission:reservations.cancel');
        Route::post('reservations/{reservation}/create-mission', [ReservationController::class, 'createMission'])
            ->middleware('permission:reservations.create_mission');
        Route::post('reservations/{reservation}/handover-pickup', [ReservationController::class, 'handoverPickup'])
            ->middleware('permission:rentals.handover_pickup');
        Route::post('reservations/{reservation}/request-extension', [ReservationController::class, 'requestExtension'])
            ->middleware('permission:rentals.extension');
        Route::post('reservations/{reservation}/handover-return', [ReservationController::class, 'handoverReturn'])
            ->middleware('permission:rentals.handover_return');
        Route::post('reservations/{reservation}/damage-report', [ReservationController::class, 'damageReport'])
            ->middleware('permission:rentals.damage_report');
        Route::post('reservations/{reservation}/close-billing', [ReservationController::class, 'closeBilling'])
            ->middleware('permission:rentals.close_billing');

        Route::get('missions', [MissionController::class, 'index'])
            ->middleware('permission:missions.view');
        Route::get('missions/{mission}', [MissionController::class, 'show'])
            ->middleware('permission:missions.view');
        Route::post('missions/{mission}/start', [MissionController::class, 'start'])
            ->middleware('permission:missions.start');
        Route::post('missions/{mission}/complete', [MissionController::class, 'complete'])
            ->middleware('permission:missions.complete');
        Route::post('missions/{mission}/checklist-items', [MissionController::class, 'addChecklistItem'])
            ->middleware('permission:missions.add_checklist');
        Route::post('missions/{mission}/photos', [MissionController::class, 'uploadPhoto'])
            ->middleware('permission:missions.upload_photo');

        // ==================================================================
        // Mobile Ops — role-aware surface for field agents + customer portal
        // (see MobileOpsController for row-scoping rules; the legacy
        // `/v1/missions/*` routes above are kept for back-office consumers).
        // ==================================================================
        Route::get('mobile-ops/my-missions', [\App\Http\Controllers\Api\V1\MobileOpsController::class, 'myMissions'])
            ->middleware('permission:missions.view');
        Route::get('mobile-ops/missions/{mission}', [\App\Http\Controllers\Api\V1\MobileOpsController::class, 'show'])
            ->middleware('permission:missions.view');
        Route::post('mobile-ops/missions/{mission}/start', [\App\Http\Controllers\Api\V1\MobileOpsController::class, 'start'])
            ->middleware('permission:missions.start');
        Route::post('mobile-ops/missions/{mission}/checklist', [\App\Http\Controllers\Api\V1\MobileOpsController::class, 'addChecklistItem'])
            ->middleware('permission:missions.add_checklist');
        Route::post('mobile-ops/missions/{mission}/photos', [\App\Http\Controllers\Api\V1\MobileOpsController::class, 'uploadPhotos'])
            ->middleware('permission:missions.upload_photo');
        Route::post('mobile-ops/missions/{mission}/customer-signature', [\App\Http\Controllers\Api\V1\MobileOpsController::class, 'customerSignature'])
            ->middleware('permission:missions.customer_signature');
        Route::post('mobile-ops/missions/{mission}/complete', [\App\Http\Controllers\Api\V1\MobileOpsController::class, 'complete'])
            ->middleware('permission:missions.complete');
        Route::get('mobile-ops/customer-tracking', [\App\Http\Controllers\Api\V1\MobileOpsController::class, 'customerTracking'])
            ->middleware('permission:mobile_ops.customer_tracking');

        // ==================================================================
        // Phase 3 — Customers & KYC
        // ==================================================================
        Route::get('customers', [CustomerController::class, 'index'])
            ->middleware('permission:customers.view');
        Route::get('customers/{customer}', [CustomerController::class, 'show'])
            ->middleware('permission:customers.view');
        Route::get('customers/{customer}/dossier', [CustomerController::class, 'dossier'])
            ->middleware('permission:customers.view_dossier');
        Route::post('customers', [CustomerController::class, 'store'])
            ->middleware('permission:customers.create');
        Route::put('customers/{customer}', [CustomerController::class, 'update'])
            ->middleware('permission:customers.update');
        Route::patch('customers/{customer}', [CustomerController::class, 'update'])
            ->middleware('permission:customers.update');
        Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])
            ->middleware('permission:customers.delete');

        // Sub-resources
        Route::post('customers/{customer}/addresses', [CustomerSubresourceController::class, 'storeAddress'])
            ->middleware('permission:customers.manage_addresses');
        Route::put('customers/{customer}/addresses/{address}', [CustomerSubresourceController::class, 'updateAddress'])
            ->middleware('permission:customers.manage_addresses');
        Route::delete('customers/{customer}/addresses/{address}', [CustomerSubresourceController::class, 'destroyAddress'])
            ->middleware('permission:customers.manage_addresses');

        Route::post('customers/{customer}/contacts', [CustomerSubresourceController::class, 'storeContact'])
            ->middleware('permission:customers.manage_contacts');
        Route::put('customers/{customer}/contacts/{contact}', [CustomerSubresourceController::class, 'updateContact'])
            ->middleware('permission:customers.manage_contacts');
        Route::delete('customers/{customer}/contacts/{contact}', [CustomerSubresourceController::class, 'destroyContact'])
            ->middleware('permission:customers.manage_contacts');

        Route::post('customers/{customer}/bank-accounts', [CustomerSubresourceController::class, 'storeBankAccount'])
            ->middleware('permission:customers.manage_bank_accounts');
        Route::put('customers/{customer}/bank-accounts/{bankAccount}', [CustomerSubresourceController::class, 'updateBankAccount'])
            ->middleware('permission:customers.manage_bank_accounts');
        Route::delete('customers/{customer}/bank-accounts/{bankAccount}', [CustomerSubresourceController::class, 'destroyBankAccount'])
            ->middleware('permission:customers.manage_bank_accounts');

        Route::get('customers/{customer}/notes', [CustomerSubresourceController::class, 'listNotes'])
            ->middleware('permission:customers.view_dossier');
        Route::post('customers/{customer}/notes', [CustomerSubresourceController::class, 'storeNote'])
            ->middleware('permission:customers.manage_notes');
        Route::delete('customers/{customer}/notes/{note}', [CustomerSubresourceController::class, 'destroyNote'])
            ->middleware('permission:customers.manage_notes');

        // Defense in depth: blacklist requires both permission AND a hard role gate.
        Route::post('customers/{customer}/blacklist', [CustomerSubresourceController::class, 'blacklist'])
            ->middleware(['permission:customers.blacklist', 'role:ADMIN,DIRECTEUR,CONTENTIEUX']);
        Route::delete('customers/{customer}/blacklist', [CustomerSubresourceController::class, 'unblacklist'])
            ->middleware(['permission:customers.blacklist', 'role:ADMIN,DIRECTEUR,CONTENTIEUX']);

        // KYC workflow
        Route::get('customers/{customer}/kyc-cases', [KycController::class, 'listCases'])
            ->middleware('permission:kyc.view');
        Route::post('customers/{customer}/kyc-cases', [KycController::class, 'createCase'])
            ->middleware('permission:kyc.create_case');
        Route::get('kyc-cases/{kycCase}', [KycController::class, 'showCase'])
            ->middleware('permission:kyc.view');
        Route::post('kyc-cases/{kycCase}/documents', [KycController::class, 'uploadDocument'])
            ->middleware('permission:kyc.upload_document');
        Route::delete('kyc-documents/{document}', [KycController::class, 'destroyDocument'])
            ->middleware('permission:kyc.delete_document');
        Route::post('kyc-documents/{document}/verify', [KycController::class, 'verifyDocument'])
            ->middleware(['permission:kyc.verify_document', 'role:ADMIN,DIRECTEUR,ANALYSTE_CREDIT']);
        Route::post('kyc-cases/{kycCase}/approve', [KycController::class, 'approve'])
            ->middleware(['permission:kyc.approve', 'role:ADMIN,DIRECTEUR,ANALYSTE_CREDIT']);
        Route::post('kyc-cases/{kycCase}/reject', [KycController::class, 'reject'])
            ->middleware(['permission:kyc.reject', 'role:ADMIN,DIRECTEUR,ANALYSTE_CREDIT']);

        // ==================================================================
        // Phase 9 — Used cars (VO)
        // ==================================================================
        Route::get('used-cars/listings', [UsedCarController::class, 'index'])
            ->middleware('permission:usedcars.view');
        Route::get('used-cars/listings/{usedCarListing}', [UsedCarController::class, 'show'])
            ->middleware('permission:usedcars.view');
        Route::get('used-cars/listings/{usedCarListing}/valuations', [UsedCarController::class, 'valuations'])
            ->middleware('permission:usedcars.view_valuations');
        Route::get('used-cars/listings/{usedCarListing}/transfers', [UsedCarController::class, 'transfers'])
            ->middleware('permission:usedcars.view');

        Route::post('used-cars/listings', [UsedCarController::class, 'store'])
            ->middleware('permission:usedcars.create');
        Route::put('used-cars/listings/{usedCarListing}', [UsedCarController::class, 'update'])
            ->middleware('permission:usedcars.update');
        Route::patch('used-cars/listings/{usedCarListing}', [UsedCarController::class, 'update'])
            ->middleware('permission:usedcars.update');
        Route::delete('used-cars/listings/{usedCarListing}', [UsedCarController::class, 'destroy'])
            ->middleware('permission:usedcars.delete');
        Route::post('used-cars/listings/{usedCarListing}/evaluate', [UsedCarController::class, 'evaluate'])
            ->middleware('permission:usedcars.evaluate');
        Route::post('used-cars/listings/{usedCarListing}/publish', [UsedCarController::class, 'publish'])
            ->middleware('permission:usedcars.publish');
        Route::post('used-cars/listings/{usedCarListing}/reserve', [UsedCarController::class, 'reserve'])
            ->middleware('permission:usedcars.reserve');
        Route::delete('used-cars/listings/{usedCarListing}/reserve', [UsedCarController::class, 'cancelReservation'])
            ->middleware('permission:usedcars.reserve');
        Route::post('used-cars/listings/{usedCarListing}/sell', [UsedCarController::class, 'sell'])
            ->middleware(['permission:usedcars.sell', 'role:ADMIN,DIRECTEUR']);
        Route::post('used-cars/listings/{listing}/sell-and-invoice', [UsedCarController::class, 'sellAndInvoiceByListing'])
            ->middleware(['permission:usedcars.sell', 'role:ADMIN,DIRECTEUR']);
        Route::put('vehicle-ownership-transfers/{transfer}', [UsedCarController::class, 'updateTransfer'])
            ->middleware(['permission:usedcars.transfer', 'role:ADMIN,DIRECTEUR']);
        Route::patch('vehicle-ownership-transfers/{transfer}', [UsedCarController::class, 'updateTransfer'])
            ->middleware(['permission:usedcars.transfer', 'role:ADMIN,DIRECTEUR']);

        // ==================================================================
        // Phase 10 — Invoicing / Payments / Treasury
        // ==================================================================
        Route::get('invoices', [InvoiceController::class, 'index'])
            ->middleware('permission:invoices.view');
        Route::get('invoices/{invoice}', [InvoiceController::class, 'show'])
            ->middleware('permission:invoices.view');
        Route::post('invoices', [InvoiceController::class, 'store'])
            ->middleware('permission:invoices.create');
        Route::put('invoices/{invoice}', [InvoiceController::class, 'update'])
            ->middleware('permission:invoices.update');
        Route::patch('invoices/{invoice}', [InvoiceController::class, 'update'])
            ->middleware('permission:invoices.update');
        Route::delete('invoices/{invoice}', [InvoiceController::class, 'destroy'])
            ->middleware('permission:invoices.delete');
        Route::post('invoices/{invoice}/issue', [InvoiceController::class, 'issue'])
            ->middleware('permission:invoices.issue');
        Route::post('invoices/{invoice}/cancel', [InvoiceController::class, 'cancel'])
            ->middleware('permission:invoices.cancel');
        Route::post('contracts/{contract}/generate-invoice', [InvoiceController::class, 'generateFromContract'])
            ->middleware('permission:invoices.generate_from_contract');

        Route::get('payments', [PaymentController::class, 'index'])
            ->middleware('permission:payments.view');
        Route::get('payments/{payment}', [PaymentController::class, 'show'])
            ->middleware('permission:payments.view');
        Route::post('payments', [PaymentController::class, 'store'])
            ->middleware('permission:payments.create');
        Route::post('payments/{payment}/allocate', [PaymentController::class, 'allocate'])
            ->middleware('permission:payments.allocate');
        Route::delete('payment-allocations/{allocation}', [PaymentController::class, 'removeAllocation'])
            ->middleware('permission:payments.unallocate');

        Route::get('customers/{customer}/balance', [CustomerBalanceController::class, 'balance'])
            ->middleware('permission:customer_balance.view');
        Route::get('customers/{customer}/statement', [CustomerBalanceController::class, 'statement'])
            ->middleware('permission:customer_balance.view');

        Route::get('treasury/summary', [TreasuryController::class, 'summary'])
            ->middleware('permission:treasury.view');
        Route::get('treasury/bank-accounts', [TreasuryController::class, 'listAccounts'])
            ->middleware('permission:treasury.view');
        Route::get('treasury/bank-accounts/{bankAccount}/transactions', [TreasuryController::class, 'listTransactions'])
            ->middleware('permission:treasury.view');
        Route::post('treasury/bank-accounts', [TreasuryController::class, 'storeAccount'])
            ->middleware(['permission:treasury.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::put('treasury/bank-accounts/{bankAccount}', [TreasuryController::class, 'updateAccount'])
            ->middleware(['permission:treasury.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::patch('treasury/bank-accounts/{bankAccount}', [TreasuryController::class, 'updateAccount'])
            ->middleware(['permission:treasury.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::delete('treasury/bank-accounts/{bankAccount}', [TreasuryController::class, 'destroyAccount'])
            ->middleware(['permission:treasury.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::post('treasury/bank-accounts/{bankAccount}/transactions/import', [TreasuryController::class, 'importTransactions'])
            ->middleware(['permission:treasury.import', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::post('treasury/bank-transactions/{transaction}/match', [TreasuryController::class, 'matchTransaction'])
            ->middleware(['permission:treasury.match', 'role:ADMIN,DIRECTEUR,COMPTABLE']);

        Route::get('fixed-charges/dashboard', [FixedChargeController::class, 'dashboard'])
            ->middleware('permission:invoices.view');
        Route::get('fixed-charges', [FixedChargeController::class, 'index'])
            ->middleware('permission:invoices.view');
        Route::post('fixed-charges', [FixedChargeController::class, 'store'])
            ->middleware('permission:invoices.create');
        Route::get('fixed-charges/{fixedCharge}', [FixedChargeController::class, 'show'])
            ->middleware('permission:invoices.view');
        Route::put('fixed-charges/{fixedCharge}', [FixedChargeController::class, 'update'])
            ->middleware('permission:invoices.update');
        Route::patch('fixed-charges/{fixedCharge}', [FixedChargeController::class, 'update'])
            ->middleware('permission:invoices.update');
        Route::post('fixed-charges/{fixedCharge}/generate-payment', [FixedChargeController::class, 'generatePayment'])
            ->middleware('permission:invoices.create');
        Route::post('fixed-charge-payments/{fixedChargePayment}/mark-paid', [FixedChargePaymentController::class, 'markPaid'])
            ->middleware('permission:payments.create');

        // ==================================================================
        // Phase 11 — Accounting
        // ==================================================================
        Route::prefix('accounting')->group(function () {
            // Chart of accounts
            Route::get('accounts', [AccountingAccountController::class, 'index'])
                ->middleware('permission:accounting.accounts.view');
            Route::get('accounts/{accountingAccount}', [AccountingAccountController::class, 'show'])
                ->middleware('permission:accounting.accounts.view');
            Route::post('accounts', [AccountingAccountController::class, 'store'])
                ->middleware(['permission:accounting.accounts.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::put('accounts/{accountingAccount}', [AccountingAccountController::class, 'update'])
                ->middleware(['permission:accounting.accounts.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::patch('accounts/{accountingAccount}', [AccountingAccountController::class, 'update'])
                ->middleware(['permission:accounting.accounts.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::delete('accounts/{accountingAccount}', [AccountingAccountController::class, 'destroy'])
                ->middleware(['permission:accounting.accounts.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);

            // Journals
            Route::get('journals', [AccountingJournalController::class, 'index'])
                ->middleware('permission:accounting.journals.view');
            Route::post('journals', [AccountingJournalController::class, 'store'])
                ->middleware(['permission:accounting.journals.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::put('journals/{accountingJournal}', [AccountingJournalController::class, 'update'])
                ->middleware(['permission:accounting.journals.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::patch('journals/{accountingJournal}', [AccountingJournalController::class, 'update'])
                ->middleware(['permission:accounting.journals.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::delete('journals/{accountingJournal}', [AccountingJournalController::class, 'destroy'])
                ->middleware(['permission:accounting.journals.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);

            // Journal entries
            Route::get('entries', [AccountingEntryController::class, 'index'])
                ->middleware('permission:accounting.entries.view');
            Route::get('entries/{accountingEntry}', [AccountingEntryController::class, 'show'])
                ->middleware('permission:accounting.entries.view');
            Route::post('entries', [AccountingEntryController::class, 'store'])
                ->middleware(['permission:accounting.entries.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::put('entries/{accountingEntry}', [AccountingEntryController::class, 'update'])
                ->middleware(['permission:accounting.entries.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::patch('entries/{accountingEntry}', [AccountingEntryController::class, 'update'])
                ->middleware(['permission:accounting.entries.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::delete('entries/{accountingEntry}', [AccountingEntryController::class, 'destroy'])
                ->middleware(['permission:accounting.entries.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::post('entries/{accountingEntry}/post', [AccountingEntryController::class, 'post'])
                ->middleware(['permission:accounting.entries.post', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::post('entries/{accountingEntry}/cancel', [AccountingEntryController::class, 'cancel'])
                ->middleware(['permission:accounting.entries.cancel', 'role:ADMIN,DIRECTEUR,COMPTABLE']);

            // Reporting
            Route::get('general-ledger', [AccountingReportController::class, 'generalLedger'])
                ->middleware('permission:accounting.reports.view');
            Route::get('trial-balance', [AccountingReportController::class, 'trialBalance'])
                ->middleware('permission:accounting.reports.view');
            Route::get('balance-sheet', [AccountingReportController::class, 'balanceSheet'])
                ->middleware('permission:accounting.reports.view');
            Route::get('income-statement', [AccountingReportController::class, 'incomeStatement'])
                ->middleware('permission:accounting.reports.view');
            Route::get('tax-report', [AccountingReportController::class, 'taxReport'])
                ->middleware('permission:accounting.reports.view');
            Route::get('settings/mappings', [AccountingSettingsController::class, 'mappings'])
                ->middleware('permission:accounting.reports.view');
            Route::put('settings/mappings', [AccountingSettingsController::class, 'updateMappings'])
                ->middleware(['permission:accounting.entries.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);

            // Automatic accounting bridges
            Route::post('bridge/invoice/{invoice}', [AccountingBridgeController::class, 'fromInvoice'])
                ->middleware(['permission:accounting.bridge.run', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::post('bridge/payment/{payment}', [AccountingBridgeController::class, 'fromPayment'])
                ->middleware(['permission:accounting.bridge.run', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::post('bridge/depreciation/{depreciationLine}', [AccountingBridgeController::class, 'fromDepreciation'])
                ->middleware(['permission:accounting.bridge.run', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
            Route::post('bridge/asset-disposal/{fixedAsset}', [AccountingBridgeController::class, 'fromAssetDisposal'])
                ->middleware(['permission:accounting.bridge.run', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        });

        // Taxes
        Route::get('taxes', [TaxController::class, 'index'])
            ->middleware('permission:taxes.view');
        Route::post('taxes', [TaxController::class, 'store'])
            ->middleware(['permission:taxes.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::put('taxes/{tax}', [TaxController::class, 'update'])
            ->middleware(['permission:taxes.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::patch('taxes/{tax}', [TaxController::class, 'update'])
            ->middleware(['permission:taxes.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::delete('taxes/{tax}', [TaxController::class, 'destroy'])
            ->middleware(['permission:taxes.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);

        // Fiscal years
        Route::get('fiscal-years', [FiscalYearController::class, 'index'])
            ->middleware('permission:fiscal_years.view');
        Route::get('fiscal-years/current-period', [FiscalYearController::class, 'currentPeriod'])
            ->middleware('permission:fiscal_years.view');
        Route::get('fiscal-years/{fiscalYear}', [FiscalYearController::class, 'show'])
            ->middleware('permission:fiscal_years.view');
        Route::post('fiscal-years', [FiscalYearController::class, 'store'])
            ->middleware(['permission:fiscal_years.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::post('fiscal-years/{fiscalYear}/close', [FiscalYearController::class, 'close'])
            ->middleware(['permission:fiscal_years.close', 'role:ADMIN,DIRECTEUR,COMPTABLE']);

        // Fixed assets
        Route::get('fixed-assets', [FixedAssetController::class, 'index'])
            ->middleware('permission:fixed_assets.view');
        Route::get('fixed-assets/{fixedAsset}', [FixedAssetController::class, 'show'])
            ->middleware('permission:fixed_assets.view');
        Route::post('fixed-assets', [FixedAssetController::class, 'store'])
            ->middleware(['permission:fixed_assets.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::put('fixed-assets/{fixedAsset}', [FixedAssetController::class, 'update'])
            ->middleware(['permission:fixed_assets.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::patch('fixed-assets/{fixedAsset}', [FixedAssetController::class, 'update'])
            ->middleware(['permission:fixed_assets.manage', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::post('fixed-assets/{fixedAsset}/dispose', [FixedAssetController::class, 'dispose'])
            ->middleware(['permission:fixed_assets.dispose', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::post('fixed-assets/{fixedAsset}/depreciate', [FixedAssetController::class, 'depreciate'])
            ->middleware(['permission:fixed_assets.depreciate', 'role:ADMIN,DIRECTEUR,COMPTABLE']);

        // ==================================================================
        // Phase 12 — Arrears & Legal Recovery
        // ==================================================================
        Route::get('arrears/cases', [ArrearsCaseController::class, 'index'])
            ->middleware('permission:arrears.view');
        Route::get('arrears/cases/{arrearsCase}', [ArrearsCaseController::class, 'show'])
            ->middleware('permission:arrears.view');
        Route::post('arrears/cases', [ArrearsCaseController::class, 'store'])
            ->middleware('permission:arrears.create');
        Route::put('arrears/cases/{arrearsCase}', [ArrearsCaseController::class, 'update'])
            ->middleware('permission:arrears.update');
        Route::patch('arrears/cases/{arrearsCase}', [ArrearsCaseController::class, 'update'])
            ->middleware('permission:arrears.update');
        Route::post('arrears/cases/{arrearsCase}/action', [ArrearsCaseController::class, 'action'])
            ->middleware('permission:arrears.action');
        Route::post('arrears/cases/{arrearsCase}/escalate', [ArrearsCaseController::class, 'escalate'])
            ->middleware('permission:arrears.escalate');

        Route::get('legal-cases', [LegalCaseController::class, 'index'])
            ->middleware('permission:legal.view');
        Route::get('legal-cases/{legalCase}', [LegalCaseController::class, 'show'])
            ->middleware('permission:legal.view');
        Route::post('legal-cases', [LegalCaseController::class, 'store'])
            ->middleware(['permission:legal.manage', 'role:ADMIN,DIRECTEUR,CONTENTIEUX']);
        Route::put('legal-cases/{legalCase}', [LegalCaseController::class, 'update'])
            ->middleware(['permission:legal.manage', 'role:ADMIN,DIRECTEUR,CONTENTIEUX']);
        Route::patch('legal-cases/{legalCase}', [LegalCaseController::class, 'update'])
            ->middleware(['permission:legal.manage', 'role:ADMIN,DIRECTEUR,CONTENTIEUX']);
        Route::post('legal-cases/{legalCase}/repossession-orders', [LegalCaseController::class, 'createRepossessionOrder'])
            ->middleware(['permission:legal.repossess', 'role:ADMIN,DIRECTEUR,CONTENTIEUX']);
        Route::put('repossession-orders/{repossessionOrder}', [LegalCaseController::class, 'updateRepossessionOrder'])
            ->middleware(['permission:legal.repossess', 'role:ADMIN,DIRECTEUR,CONTENTIEUX']);
        Route::patch('repossession-orders/{repossessionOrder}', [LegalCaseController::class, 'updateRepossessionOrder'])
            ->middleware(['permission:legal.repossess', 'role:ADMIN,DIRECTEUR,CONTENTIEUX']);

        // ==================================================================
        // Phase 13 — Electronic Signature
        // ==================================================================
        Route::get('signatures/envelopes', [SignatureEnvelopeController::class, 'index'])
            ->middleware('permission:signatures.view');
        Route::get('signatures/envelopes/{id}', [SignatureEnvelopeController::class, 'show'])
            ->middleware('permission:signatures.view');
        Route::get('signatures/envelopes/{id}/events', [SignatureEnvelopeController::class, 'events'])
            ->middleware('permission:signatures.view');
        Route::get('signatures/envelopes/{id}/download-signed', [SignatureEnvelopeController::class, 'downloadSigned'])
            ->middleware('permission:signatures.view');
        Route::post('signatures/envelopes', [SignatureEnvelopeController::class, 'store'])
            ->middleware('permission:signatures.create');
        Route::post('signatures/envelopes/{id}/send', [SignatureEnvelopeController::class, 'send'])
            ->middleware('permission:signatures.send');
        Route::post('signatures/envelopes/{id}/void', [SignatureEnvelopeController::class, 'void'])
            ->middleware('permission:signatures.void');
        // OTP + Sign — kept inside auth, scoped by signer identity in the controller.
        Route::post('signatures/envelopes/{id}/verify-otp', [SignatureEnvelopeController::class, 'verifyOtp'])
            ->middleware('permission:signatures.sign');
        Route::post('signatures/envelopes/{id}/sign', [SignatureEnvelopeController::class, 'sign'])
            ->middleware('permission:signatures.sign');
        Route::post('signatures/envelopes/{id}/decline', [SignatureEnvelopeController::class, 'decline'])
            ->middleware('permission:signatures.decline');

        // ==================================================================
        // Phase 14 — Dashboard KPIs
        // ==================================================================
        Route::prefix('dashboard')->group(function () {
            Route::get('executive', [DashboardController::class, 'executive'])
                ->middleware('permission:dashboard.executive');
            Route::get('finance', [DashboardController::class, 'finance'])
                ->middleware('permission:dashboard.finance');
            Route::get('risk', [DashboardController::class, 'risk'])
                ->middleware('permission:dashboard.risk');
            Route::get('fleet', [DashboardController::class, 'fleet'])
                ->middleware('permission:dashboard.fleet');
            Route::get('gps', [DashboardController::class, 'gps'])
                ->middleware('permission:dashboard.gps');
        });

        // ==================================================================
        // AI module — deterministic intelligence + optional external provider
        // ==================================================================
        Route::get('ai/overview', [AiOverviewController::class, 'show'])
            ->middleware(['permission:ai.overview', 'role:ADMIN,DIRECTEUR']);
        Route::post('ai/assistant/messages', [AiAssistantController::class, 'messages'])
            ->middleware(['permission:ai.assistant', 'role:ADMIN,DIRECTEUR']);
        Route::get('ai/assistant/conversations', [AiAssistantController::class, 'conversations'])
            ->middleware(['permission:ai.assistant', 'role:ADMIN,DIRECTEUR']);
        Route::get('ai/predictions/maintenance', [AiPredictionController::class, 'maintenance'])
            ->middleware(['permission:ai.predictions.maintenance', 'role:ADMIN,DIRECTEUR,GESTIONNAIRE_FLOTTE']);
        Route::get('ai/predictions/credit-risk', [AiPredictionController::class, 'creditRisk'])
            ->middleware(['permission:ai.predictions.credit_risk', 'role:ADMIN,DIRECTEUR,ANALYSTE_CREDIT']);
        Route::get('ai/predictions/cash-flow', [AiPredictionController::class, 'cashFlow'])
            ->middleware(['permission:ai.predictions.cash_flow', 'role:ADMIN,DIRECTEUR,COMPTABLE']);
        Route::get('ai/predictions/vehicle-pricing', [AiPredictionController::class, 'vehiclePricing'])
            ->middleware(['permission:ai.predictions.vehicle_pricing', 'role:ADMIN,DIRECTEUR,GESTIONNAIRE_FLOTTE']);
        Route::get('ai/anomalies', [AiAnomalyController::class, 'index'])
            ->middleware(['permission:ai.anomalies', 'role:ADMIN,DIRECTEUR,CONTENTIEUX']);

        // ==================================================================
        // Sous-location (Sub-rental) module
        // ==================================================================

        // Supplier agencies
        Route::get('supplier-agencies', [SupplierAgencyController::class, 'index'])
            ->middleware('permission:supplier_agencies.view');
        Route::get('supplier-agencies/{id}', [SupplierAgencyController::class, 'show'])
            ->middleware('permission:supplier_agencies.view');
        Route::post('supplier-agencies', [SupplierAgencyController::class, 'store'])
            ->middleware('permission:supplier_agencies.manage');
        Route::put('supplier-agencies/{id}', [SupplierAgencyController::class, 'update'])
            ->middleware('permission:supplier_agencies.manage');
        Route::patch('supplier-agencies/{id}', [SupplierAgencyController::class, 'update'])
            ->middleware('permission:supplier_agencies.manage');
        Route::delete('supplier-agencies/{id}', [SupplierAgencyController::class, 'destroy'])
            ->middleware('permission:supplier_agencies.manage');

        // Sub-rental contracts
        Route::get('sub-rentals/dashboard', [SubRentalController::class, 'dashboard'])
            ->middleware('permission:sub_rentals.view');
        Route::get('sub-rentals', [SubRentalController::class, 'index'])
            ->middleware('permission:sub_rentals.view');
        Route::get('sub-rentals/{id}', [SubRentalController::class, 'show'])
            ->middleware('permission:sub_rentals.view');
        Route::post('sub-rentals', [SubRentalController::class, 'store'])
            ->middleware('permission:sub_rentals.create');
        Route::put('sub-rentals/{id}', [SubRentalController::class, 'update'])
            ->middleware('permission:sub_rentals.update');
        Route::patch('sub-rentals/{id}', [SubRentalController::class, 'update'])
            ->middleware('permission:sub_rentals.update');
        Route::post('sub-rentals/{id}/activate', [SubRentalController::class, 'activate'])
            ->middleware('permission:sub_rentals.activate');
        Route::post('sub-rentals/{id}/return', [SubRentalController::class, 'returnToSupplier'])
            ->middleware('permission:sub_rentals.return');
        Route::post('sub-rentals/{id}/close', [SubRentalController::class, 'close'])
            ->middleware('permission:sub_rentals.close');
        Route::get('sub-rentals/{id}/profitability', [SubRentalController::class, 'profitability'])
            ->middleware('permission:sub_rentals.view');
        Route::post('sub-rentals/{id}/documents', [SubRentalController::class, 'uploadDocument'])
            ->middleware('permission:sub_rentals.documents');

        // Sub-rental payments
        Route::get('sub-rentals/{id}/payments', [SubRentalPaymentController::class, 'index'])
            ->middleware('permission:sub_rentals.payments');
        Route::post('sub-rentals/{id}/payments', [SubRentalPaymentController::class, 'store'])
            ->middleware('permission:sub_rentals.payments');

        // ==================================================================
        // Admin / Directeur management surface
        // Hard role gate (role:ADMIN,DIRECTEUR) AND granular permission for
        // each verb so per-role customisation is still possible.
        // ==================================================================
        Route::middleware('role:ADMIN,DIRECTEUR')->group(function () {
            Route::get('users', [UserController::class, 'index'])
                ->middleware('permission:users.view');
            Route::get('users/{user}', [UserController::class, 'show'])
                ->middleware('permission:users.view');
            Route::post('users', [UserController::class, 'store'])
                ->middleware('permission:users.create');
            Route::put('users/{user}', [UserController::class, 'update'])
                ->middleware('permission:users.update');
            Route::patch('users/{user}', [UserController::class, 'update'])
                ->middleware('permission:users.update');
            Route::delete('users/{user}', [UserController::class, 'destroy'])
                ->middleware('permission:users.delete');
            Route::post('users/{user}/activate', [UserController::class, 'activate'])
                ->middleware('permission:users.activate');
            Route::post('users/{user}/deactivate', [UserController::class, 'deactivate'])
                ->middleware('permission:users.activate');
            Route::post('users/{user}/branches', [UserController::class, 'assignBranches'])
                ->middleware('permission:users.assign_branches');
            Route::get('users/{user}/login-history', [UserController::class, 'loginHistory'])
                ->middleware('permission:users.view_login_history');

            Route::get('roles', [RoleController::class, 'index'])
                ->middleware('permission:roles.view');
            Route::get('roles/{role}', [RoleController::class, 'show'])
                ->middleware('permission:roles.view');
            Route::post('roles', [RoleController::class, 'store'])
                ->middleware('permission:roles.manage');
            Route::put('roles/{role}', [RoleController::class, 'update'])
                ->middleware('permission:roles.manage');
            Route::patch('roles/{role}', [RoleController::class, 'update'])
                ->middleware('permission:roles.manage');
            Route::delete('roles/{role}', [RoleController::class, 'destroy'])
                ->middleware('permission:roles.manage');
            Route::post('roles/{role}/permissions', [RoleController::class, 'syncPermissions'])
                ->middleware('permission:roles.sync_permissions');

            Route::get('permissions', [PermissionController::class, 'index'])
                ->middleware('permission:permissions.view');

            Route::post('branches', [BranchController::class, 'store'])
                ->middleware('permission:branches.manage');
            Route::get('branches/{branch}', [BranchController::class, 'show'])
                ->middleware('permission:branches.view');
            Route::put('branches/{branch}', [BranchController::class, 'update'])
                ->middleware('permission:branches.manage');
            Route::patch('branches/{branch}', [BranchController::class, 'update'])
                ->middleware('permission:branches.manage');
            Route::delete('branches/{branch}', [BranchController::class, 'destroy'])
                ->middleware('permission:branches.manage');
        });
    });
});
