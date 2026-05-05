<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VehicleCostProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'vehicle_id',
        'acquired_at',
        'purchase_cost_mad',
        'residual_value_mad',
        'depreciation_months',
        'depreciation_method',
        'insurance_monthly_mad',
        'tax_monthly_mad',
        'gps_monthly_mad',
    ];

    protected $casts = [
        'acquired_at' => 'date',
        'purchase_cost_mad' => 'decimal:2',
        'residual_value_mad' => 'decimal:2',
        'insurance_monthly_mad' => 'decimal:2',
        'tax_monthly_mad' => 'decimal:2',
        'gps_monthly_mad' => 'decimal:2',
    ];

    /**
     * @return BelongsTo<Vehicle, $this>
     */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}

