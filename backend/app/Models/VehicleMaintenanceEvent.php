<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Canonical columns (see `vehicle_maintenance_events` migration):
 * performed_at (date), cost_mad (decimal), type (string), odometer_km (int), vendor (string|null), created_by (uuid|null).
 */
class VehicleMaintenanceEvent extends Model
{
    use HasFactory;

    protected $table = 'vehicle_maintenance_events';

    protected $fillable = [
        'vehicle_id',
        'type',
        'title',
        'description',
        'performed_at',
        'odometer_km',
        'vendor',
        'cost_mad',
        'created_by',
    ];

    protected $casts = [
        'performed_at' => 'date',
        'cost_mad' => 'decimal:2',
        'odometer_km' => 'integer',
    ];

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}
