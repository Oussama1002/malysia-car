<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VehicleMaintenancePlan extends Model
{
    /** French labels for maintenance_type codes (used in notifications/alerts). */
    public const TYPE_LABELS_FR = [
        'OIL_CHANGE' => 'Vidange',
        'TIRES' => 'Pneus',
        'INSPECTION' => 'Inspection',
        'BRAKES' => 'Freins',
        'FILTER' => 'Filtre',
        'BATTERY' => 'Batterie',
        'TIMING_BELT' => 'Courroie de distribution',
        'TECH_CONTROL' => 'Contrôle technique',
        'OTHER' => 'Autre',
    ];

    public static function typeLabelFr(?string $type): string
    {
        if ($type === null || trim($type) === '') {
            return 'Maintenance';
        }

        return self::TYPE_LABELS_FR[strtoupper(trim($type))] ?? $type;
    }

    protected $fillable = [
        'vehicle_id',
        'maintenance_type',
        'interval_km',
        'interval_months',
        'last_done_at',
        'next_due_at',
        'next_due_km',
        'status',
        'is_active',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'last_done_at'  => 'date',
        'next_due_at'   => 'date',
        'interval_km'   => 'integer',
        'interval_months' => 'integer',
        'next_due_km'   => 'integer',
        'status'        => 'string',
        'is_active'     => 'boolean',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    /** Derive status from date AND km thresholds */
    public function getComputedStatusAttribute(): string
    {
        if ($this->next_due_at && $this->next_due_at->isPast()) {
            return 'overdue';
        }

        $vehicleKm = (int) ($this->vehicle?->mileage_current ?? 0);
        $dueKm = (int) ($this->next_due_km ?? 0);

        if ($dueKm > 0 && $vehicleKm >= $dueKm) {
            return 'overdue';
        }
        if ($dueKm > 0 && ($dueKm - $vehicleKm) <= 500) {
            return 'due_soon';
        }

        if ($this->next_due_at && $this->next_due_at->diffInDays(now()) <= 30) {
            return 'due_soon';
        }

        return 'ok';
    }
}
