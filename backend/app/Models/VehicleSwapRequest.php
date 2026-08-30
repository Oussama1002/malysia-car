<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VehicleSwapRequest extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'vehicle_swap_requests';

    protected $fillable = [
        'id',
        'company_id',
        'contract_id',
        'reservation_id',
        'customer_id',
        'old_vehicle_id',
        'new_vehicle_id',
        'status',
        'reason',
        'rejection_reason',
        'requested_by',
        'resolved_by',
        'requested_at',
        'resolved_at',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    public function oldVehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'old_vehicle_id');
    }

    public function newVehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'new_vehicle_id');
    }

    public function contract(): BelongsTo
    {
        return $this->belongsTo(\App\Models\Contract::class);
    }

    public function reservation(): BelongsTo
    {
        return $this->belongsTo(Reservation::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function requestedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function resolvedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
