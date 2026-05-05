<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Geofence extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'geofences';

    protected $fillable = [
        'id',
        'company_id',
        'name',
        'geofence_type',
        'center_latitude',
        'center_longitude',
        'radius_meters',
        'polygon_geojson',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'center_latitude' => 'decimal:7',
        'center_longitude' => 'decimal:7',
        'radius_meters' => 'decimal:2',
        'polygon_geojson' => 'array',
        'is_active' => 'boolean',
    ];

    /**
     * @return BelongsToMany<Vehicle, $this>
     */
    public function vehicles(): BelongsToMany
    {
        return $this->belongsToMany(Vehicle::class, 'geofence_vehicle', 'geofence_id', 'vehicle_id')
            ->withPivot(['assigned_at', 'assigned_by']);
    }
}

