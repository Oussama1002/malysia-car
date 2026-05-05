<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class VehicleTechnicalInspection extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'vehicle_id',
        'inspection_date',
        'expiry_date',
        'center_name',
        'result',
        'defects',
        'document_file_id',
        'next_due_date',
    ];

    protected $casts = [
        'inspection_date' => 'date',
        'expiry_date' => 'date',
        'next_due_date' => 'date',
        'defects' => 'array',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}
