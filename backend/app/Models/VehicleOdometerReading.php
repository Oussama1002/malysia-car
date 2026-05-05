<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VehicleOdometerReading extends Model
{
    use HasFactory;

    protected $fillable = [
        'vehicle_id',
        'reading_km',
        'read_at',
        'source',
        'note',
        'created_by',
    ];

    protected $casts = [
        'read_at' => 'datetime',
    ];

    /**
     * @return BelongsTo<Vehicle, $this>
     */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}

