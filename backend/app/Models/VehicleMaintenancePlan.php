<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VehicleMaintenancePlan extends Model
{
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

    /** Derive status fallback when column is empty */
    public function getComputedStatusAttribute(): string
    {
        if ($this->next_due_at && $this->next_due_at->isPast()) {
            return 'overdue';
        }
        if ($this->next_due_at && $this->next_due_at->diffInDays(now()) <= 30) {
            return 'due_soon';
        }

        return 'ok';
    }
}
