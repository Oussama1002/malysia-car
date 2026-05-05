<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\InsuranceClaim;

class VehicleAccident extends Model
{
    protected $fillable = [
        'vehicle_id',
        'driver_user_id',
        'contract_id',
        'accident_date',
        'location',
        'description',
        'severity',
        'responsible_party',
        'police_report_number',
        'insurance_claim_number',
        'estimated_damage_cost',
        'final_cost',
        'status',
        'created_by',
    ];

    protected $casts = [
        'accident_date'          => 'date',
        'estimated_damage_cost'  => 'decimal:2',
        'final_cost'             => 'decimal:2',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_user_id');
    }

    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class, 'contract_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(AccidentDocument::class, 'accident_id');
    }

    public function repairs(): HasMany
    {
        return $this->hasMany(VehicleRepair::class, 'linked_accident_id');
    }

    public function insuranceClaims(): HasMany
    {
        return $this->hasMany(InsuranceClaim::class, 'accident_id');
    }
}
