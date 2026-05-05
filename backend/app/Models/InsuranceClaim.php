<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InsuranceClaim extends Model
{
    use HasUuids;

    protected $fillable = [
        'accident_id',
        'vehicle_id',
        'insurer_name',
        'claim_number',
        'declared_at',
        'estimated_amount',
        'approved_amount',
        'reimbursed_amount',
        'status',
    ];

    protected $casts = [
        'declared_at' => 'datetime',
        'estimated_amount' => 'decimal:2',
        'approved_amount' => 'decimal:2',
        'reimbursed_amount' => 'decimal:2',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    public function accident(): BelongsTo
    {
        return $this->belongsTo(VehicleAccident::class, 'accident_id');
    }
}
