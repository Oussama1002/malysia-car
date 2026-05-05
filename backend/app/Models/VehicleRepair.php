<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VehicleRepair extends Model
{
    protected $fillable = [
        'vehicle_id',
        'repair_type',
        'description',
        'reported_at',
        'started_at',
        'completed_at',
        'downtime_days',
        'cost_amount',
        'vendor_name',
        'status',
        'linked_accident_id',
        'created_by',
    ];

    protected $casts = [
        'reported_at'   => 'datetime',
        'started_at'    => 'datetime',
        'completed_at'  => 'datetime',
        'cost_amount'   => 'decimal:2',
        'downtime_days' => 'integer',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    public function accident(): BelongsTo
    {
        return $this->belongsTo(VehicleAccident::class, 'linked_accident_id');
    }

    /** Compute downtime from timestamps when not stored explicitly */
    public function getComputedDowntimeDaysAttribute(): ?int
    {
        if ($this->downtime_days !== null) {
            return $this->downtime_days;
        }
        if ($this->started_at && $this->completed_at) {
            return (int) $this->started_at->diffInDays($this->completed_at);
        }

        return null;
    }
}
