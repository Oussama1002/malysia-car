<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MaintenanceAlert extends Model
{
    use HasUuids;

    protected $fillable = [
        'vehicle_id',
        'plan_id',
        'repair_id',
        'document_id',
        'alert_type',
        'severity',
        'status',
        'title',
        'description',
        'payload',
        'triggered_at',
        'resolved_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'triggered_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}
