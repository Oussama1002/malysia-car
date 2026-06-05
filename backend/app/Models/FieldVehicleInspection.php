<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FieldVehicleInspection extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'mission_id',
        'vehicle_id',
        'inspection_type',
        'odometer_km',
        'fuel_level',
        'exterior_condition',
        'interior_condition',
        'damage_notes',
        'gps_lat',
        'gps_lng',
        'inspected_by',
    ];

    protected $casts = [
        'odometer_km' => 'integer',
        'fuel_level' => 'integer',
        'gps_lat' => 'float',
        'gps_lng' => 'float',
    ];

    public function mission(): BelongsTo
    {
        return $this->belongsTo(Mission::class);
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }
}
