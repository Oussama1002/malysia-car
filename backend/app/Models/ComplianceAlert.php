<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComplianceAlert extends Model
{
    use HasUuids;

    protected $fillable = [
        'vehicle_id',
        'alert_type',
        'severity',
        'status',
        'title',
        'description',
        'due_date',
        'payload',
        'triggered_at',
        'resolved_at',
    ];

    protected $casts = [
        'due_date' => 'date',
        'triggered_at' => 'datetime',
        'resolved_at' => 'datetime',
        'payload' => 'array',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}
