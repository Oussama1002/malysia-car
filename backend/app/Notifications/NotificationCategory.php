<?php

namespace App\Notifications;

/**
 * Canonical notification category codes (in_app + delivery rows use the parent notification).
 */
final class NotificationCategory
{
    public const KYC_PENDING_VALIDATION = 'kyc.pending_validation';

    public const KYC_DOCUMENT_UPLOADED = 'kyc.document_uploaded';

    public const KYC_DOCUMENT_VERIFIED = 'kyc.document_verified';

    public const KYC_DOCUMENT_REJECTED = 'kyc.document_rejected';

    public const KYC_APPROVED = 'kyc.approved';

    public const KYC_REJECTED = 'kyc.rejected';

    public const CONTRACT_PENDING_APPROVAL = 'contract.pending_approval';

    public const CONTRACT_APPROVED = 'contract.approved';

    public const CONTRACT_ACTIVATED = 'contract.activated';

    public const CONTRACT_TERMINATED = 'contract.terminated';

    public const INVOICE_OVERDUE = 'invoice.overdue';

    public const PAYMENT_RECEIVED = 'payment.received';

    public const ARREARS_DETECTED = 'arrears.detected';

    public const ARREARS_ESCALATED = 'arrears.escalated';

    public const GPS_ALERT = 'gps.alert';

    public const GPS_UNKNOWN_DEVICE = 'gps.unknown_device';

    public const FLEET_ACCIDENT_DECLARED = 'fleet.accident_declared';

    public const SIGNATURE_SENT = 'signature.sent';

    public const SIGNATURE_VOIDED = 'signature.voided';

    public const SIGNATURE_SIGNED = 'signature.signed';

    public const SIGNATURE_DECLINED = 'signature.declined';
}
