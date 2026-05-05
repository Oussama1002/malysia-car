<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class VehicleInsurancePolicy extends Model
{
    use HasUuids, SoftDeletes;

    protected $fillable = [
        'vehicle_id',
        'insurer_name',
        'policy_number',
        'coverage_type',
        'start_date',
        'end_date',
        'premium_amount',
        'status',
        'document_file_id',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'premium_amount' => 'decimal:2',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}
