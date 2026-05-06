<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VehicleMovement extends Model
{
    use HasUuids;

    protected $table = 'vehicle_movements';

    protected $fillable = [
        'vehicle_id',
        'movement_type',
        'related_type',
        'related_id',
        'branch_from_id',
        'branch_to_id',
        'customer_id',
        'odometer_km',
        'fuel_level',
        'condition_notes',
        'performed_by',
        'performed_at',
        'signature_file_id',
        'report_file_id',
    ];

    protected $casts = [
        'performed_at' => 'datetime',
        'odometer_km' => 'decimal:2',
        'fuel_level' => 'decimal:2',
    ];

    /** @return BelongsTo<Vehicle, $this> */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}
