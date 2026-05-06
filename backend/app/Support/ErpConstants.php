<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Centralized domain strings for client-remarks features (no DB enums).
 */
final class ErpConstants
{
    /** Fixed charge categories (FR labels as stored values). */
    public const FIXED_CHARGE_CATEGORIES = [
        'loyer agence',
        'salaires',
        'assurance',
        'parking',
        'internet/téléphone',
        'comptabilité',
        'crédit véhicule',
        'autres',
    ];

    public const FIXED_CHARGE_FREQUENCIES = ['monthly', 'quarterly', 'yearly', 'one_time'];

    public const FIXED_CHARGE_STATUSES = ['active', 'paused', 'closed'];

    public const FIXED_CHARGE_PAYMENT_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'];

    public const VEHICLE_MOVEMENT_TYPES = [
        'entry',
        'exit',
        'return',
        'transfer',
        'immobilization',
        'release',
    ];

    public const OWNERSHIP_STATUSES = ['owned', 'leased', 'sub_rented', 'consigned'];

    public const PHYSICAL_STATUSES = ['good', 'maintenance', 'repair', 'accident', 'immobilized'];

    public const SUB_RENTAL_STATUSES = ['draft', 'active', 'returned', 'closed', 'cancelled'];

    /** Maintenance / repair event types (extended list). */
    public const MAINTENANCE_EVENT_TYPES = [
        'vidange',
        'plaquettes',
        'pneus',
        'batterie',
        'freins',
        'contrôle technique',
        'assurance',
        'réparation mécanique',
        'réparation électrique',
        'carrosserie',
        'accident',
        'other',
    ];

    /** Notification / alert type codes for schedulers and UI. */
    public const ALERT_TYPES = [
        'maintenance_due',
        'oil_change_due',
        'brake_pads_due',
        'technical_inspection_due',
        'insurance_due',
        'gps_alert',
        'contract_follow_up',
        'contract_expiring',
        'reservation_return_due',
        'vehicle_should_return',
        'sub_rental_return_due',
        'payment_due',
        'fixed_charge_due',
    ];
}
